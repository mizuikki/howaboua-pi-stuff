import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeCompactionV2Window, executeNativeCompactionV2 } from "../src/adapter/compaction/v2-client.ts";
import { formatCodexUsageLimitError } from "../src/providers/openai-codex/errors.ts";

const runtime = {
	provider: "openai-codex",
	api: "openai-codex-responses",
	apiFamily: "openai-codex-responses",
	model: "gpt-5.6",
	baseUrl: "https://chatgpt.example/backend-api",
	responsesUrl: "https://chatgpt.example/backend-api/codex/responses",
	compactPath: "codex/responses/compact",
	compactUrl: "https://chatgpt.example/backend-api/codex/responses/compact",
	apiKey: ["header", Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_1" } })).toString("base64url"), "signature"].join("."),
	currentModel: { headers: {} },
} as any;

const request = {
	model: "gpt-5.6",
	instructions: "Instructions",
	input: [
		{ role: "developer", content: "Developer instructions" },
		{ role: "user", content: [{ type: "input_text", text: "Keep this user context" }] },
		{ type: "function_call", call_id: "call_1", name: "exec_command", arguments: "{}" },
	],
	parallel_tool_calls: true,
} as any;

function sseResponse(events: unknown[]): Response {
	return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
}

async function withMockFetch(fetchImpl: typeof fetch, run: () => Promise<void>): Promise<void> {
	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = fetchImpl;
		await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

test("v2 compaction uses a streamed Responses request and retains the Codex window shape", async () => {
	const originalFetch = globalThis.fetch;
	const calls: Array<{ url: string; init: RequestInit }> = [];

	try {
		globalThis.fetch = (async (url, init) => {
			calls.push({ url: String(url), init: init as RequestInit });
			return sseResponse([
				{ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "sealed" } },
				{ type: "response.completed", response: { id: "resp_compact", created_at: 1_700_000_000, status: "completed" } },
			]);
		}) as typeof fetch;

		const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request), sessionId: "session-1" });

		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.equal(calls.length, 1);
		assert.equal(calls[0]!.url, runtime.responsesUrl);
		const headers = calls[0]!.init.headers as Record<string, string>;
		assert.equal(headers["x-codex-beta-features"], "remote_compaction_v2");
		assert.equal(headers["session-id"], "session-1");
		const body = JSON.parse(calls[0]!.init.body as string);
		assert.equal(body.stream, true);
		assert.equal(body.store, false);
		assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
		assert.deepEqual(body.input.at(-1), { type: "compaction_trigger" });
		assert.equal(body.input.filter((item: { type?: string }) => item.type === "compaction_trigger").length, 1);
		assert.deepEqual(body.client_metadata["x-codex-window-id"], "session-1");
		assert.deepEqual(JSON.parse(body.client_metadata["x-codex-turn-metadata"]), {
			session_id: "session-1",
			thread_id: "session-1",
			window_id: "session-1",
			request_kind: "compaction",
			compaction: {
				trigger: "manual",
				reason: "user_requested",
				implementation: "responses_compaction_v2",
				phase: "standalone_turn",
				strategy: "memento",
			},
		});
		assert.deepEqual(result.compactedWindow, [
			{ role: "user", content: [{ type: "input_text", text: "Keep this user context" }] },
			{ type: "compaction", encrypted_content: "sealed" },
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("v2 compaction preserves a context-window response.failed error on HTTP 200", async () => {
	const response = {
		id: "resp_failed_context",
		status: "failed",
		error: {
			code: "context_length_exceeded",
			message: "Your input exceeds the context window of this model; Pi compaction will run.",
		},
	};
	await withMockFetch(
		(async () => sseResponse([{ type: "response.failed", response }])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, {
				ok: false,
				reason: "response-failed",
				status: 200,
				errorMessage: response.error.message,
				responseJson: response,
			});
			if (result.ok) return;
			assert.doesNotMatch(result.errorMessage ?? "", /Expected exactly one compaction item|missing-completion/);
		},
	);
});

test("v2 compaction preserves quota and rate-limit response.failed errors for usage formatting", async () => {
	const response = {
		id: "resp_failed_limit",
		status: "failed",
		error: {
			code: "rate_limit_exceeded",
			message: "Too many requests",
		},
	};
	await withMockFetch(
		(async () => sseResponse([{ type: "response.failed", response }])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.equal(result.ok, false);
			if (result.ok) return;
			assert.equal(result.reason, "response-failed");
			assert.equal(result.status, 200);
			assert.equal(result.errorMessage, response.error.message);
			assert.deepEqual(result.responseJson, response);
			assert.match(formatCodexUsageLimitError(result.responseJson) ?? "", /Codex usage limit reached/);
		},
	);
});

test("v2 compaction treats response.failed after an item as the terminal failure", async () => {
	const response = {
		id: "resp_failed_after_item",
		status: "failed",
		error: { code: "server_error", message: "Compaction service failed" },
	};
	await withMockFetch(
		(async () => sseResponse([
			{ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "sealed" } },
			{ type: "response.failed", response },
			{ type: "response.completed", response: { status: "completed" } },
		])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.equal(result.ok, false);
			if (result.ok) return;
			assert.equal(result.reason, "response-failed");
			assert.equal(result.status, 200);
			assert.equal(result.errorMessage, response.error.message);
			assert.deepEqual(result.responseJson, response);
		},
	);
});

test("v2 compaction reports response.incomplete with its structured reason", async () => {
	const response = {
		id: "resp_incomplete",
		status: "incomplete",
		incomplete_details: { reason: "max_output_tokens" },
	};
	await withMockFetch(
		(async () => sseResponse([
			{ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "sealed" } },
			{ type: "response.incomplete", response },
		])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.equal(result.ok, false);
			if (result.ok) return;
			assert.equal(result.reason, "response-incomplete");
			assert.equal(result.status, 200);
			assert.equal(result.errorMessage, "Compaction response incomplete: max_output_tokens");
			assert.deepEqual(result.responseJson, response);
			assert.doesNotMatch(result.errorMessage ?? "", /Expected exactly one compaction item|missing-completion/);
		},
	);
});

test("v2 compaction provides a fallback when response.failed has no error object", async () => {
	const response = { id: "resp_failed_without_error", status: "failed" };
	await withMockFetch(
		(async () => sseResponse([{ type: "response.failed", response }])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, {
				ok: false,
				reason: "response-failed",
				status: 200,
				errorMessage: "Compaction response failed without an error message",
				responseJson: response,
			});
		},
	);
});

test("v2 compaction rejects a stream with multiple compaction items", async () => {
	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = (async () => sseResponse([
			{ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "first" } },
			{ type: "response.output_item.done", item: { type: "context_compaction", encrypted_content: "second" } },
			{ type: "response.completed", response: { status: "completed" } },
		])) as typeof fetch;

		const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
		assert.deepEqual(result, {
			ok: false,
			reason: "invalid-output",
			status: 200,
			errorMessage: "Expected exactly one compaction item, got 2",
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("v2 compaction reports non-2xx responses", async () => {
	await withMockFetch(
		(async () => new Response(JSON.stringify({ error: "denied" }), { status: 403 })) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, {
				ok: false,
				reason: "non-2xx",
				status: 403,
				responseText: '{"error":"denied"}',
				responseJson: { error: "denied" },
			});
		},
	);
});

test("v2 compaction rejects an empty response body", async () => {
	await withMockFetch(
		(async () => new Response(null, { status: 200 })) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, { ok: false, reason: "empty-body", status: 200 });
		},
	);
});

test("v2 compaction respects an already-aborted signal", async () => {
	const controller = new AbortController();
	controller.abort();
	await withMockFetch(
		(async () => { throw new Error("fetch should not be called"); }) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request), signal: controller.signal });
			assert.deepEqual(result, { ok: false, reason: "aborted" });
		},
	);
});

test("v2 compaction rejects a stream without a completion event", async () => {
	await withMockFetch(
		(async () => sseResponse([
			{ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "sealed" } },
		])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, { ok: false, reason: "missing-completion", status: 200 });
		},
	);
});

test("v2 compaction rejects a completed stream without a compaction item", async () => {
	await withMockFetch(
		(async () => sseResponse([
			{ type: "response.completed", response: { status: "completed" } },
		])) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, {
				ok: false,
				reason: "invalid-output",
				status: 200,
				errorMessage: "Expected exactly one compaction item, got 0",
			});
		},
	);
});

test("v2 compaction reports stream and network failures", async () => {
	const brokenStream = new ReadableStream({
		start(controller) {
			controller.error(new Error("stream broke"));
		},
	});
	await withMockFetch(
		(async () => new Response(brokenStream, { status: 200 })) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, { ok: false, reason: "invalid-stream", status: 200, errorMessage: "stream broke" });
		},
	);

	await withMockFetch(
		(async () => { throw new Error("network down"); }) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({ runtime, request: structuredClone(request) });
			assert.deepEqual(result, { ok: false, reason: "network-error", errorMessage: "network down" });
		},
	);
});

test("v2 compaction times out when the response stream stalls", async () => {
	const stalledStream = new ReadableStream({
		pull() {},
	});
	await withMockFetch(
		(async () => new Response(stalledStream, { status: 200 })) as typeof fetch,
		async () => {
			const result = await executeNativeCompactionV2({
				runtime,
				request: structuredClone(request),
				idleTimeoutMs: 10,
			});
			assert.deepEqual(result, {
				ok: false,
				reason: "invalid-stream",
				status: 200,
				errorMessage: "Compaction SSE idle timeout after 10ms",
			});
		},
	);
});

test("v2 retained window excludes model output and tool history", () => {
	const window = buildNativeCompactionV2Window([
		{ role: "system", content: "system" },
		{ role: "user", content: "user" },
		{ type: "message", role: "assistant", content: [{ type: "output_text", text: "assistant" }] },
		{ type: "function_call", call_id: "call_1", name: "exec", arguments: "{}" },
	], { type: "compaction", encrypted_content: "sealed" });

	assert.deepEqual(window, [
		{ role: "user", content: "user" },
		{ type: "compaction", encrypted_content: "sealed" },
	]);
});

test("v2 retained window excludes non-text user content from its token budget", () => {
	const window = buildNativeCompactionV2Window([
		{
			role: "user",
			content: [
				{ type: "input_text", text: "keep text" },
				{ type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "original" },
			],
		},
		{ role: "user", content: [{ type: "input_image", image_url: "https://example.test/image.png" }] },
	], { type: "compaction", encrypted_content: "sealed" });

	assert.deepEqual(window, [
		{ role: "user", content: [{ type: "input_text", text: "keep text" }] },
		{ type: "compaction", encrypted_content: "sealed" },
	]);
});
