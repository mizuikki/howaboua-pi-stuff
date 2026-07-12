import test from "node:test";
import assert from "node:assert/strict";
import { Tiktoken } from "js-tiktoken/lite";
import o200kBaseRanks from "js-tiktoken/ranks/o200k_base";
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

const testTokenEncoding = new Tiktoken(o200kBaseRanks);

function tokenCount(text: string): number {
	return testTokenEncoding.encode(text).length;
}

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

const usageLimitCases = [
	{
		name: "rate_limit_exceeded",
		response: { id: "resp_failed_rate_limit", status: "failed", error: { code: "rate_limit_exceeded", message: "Too many requests" } },
	},
	{
		name: "usage_limit_reached",
		response: { id: "resp_failed_usage_limit", status: "failed", error: { code: "usage_limit_reached", message: "Usage limit reached" } },
	},
	{
		name: "usage_not_included",
		response: { id: "resp_failed_usage_not_included", status: "failed", error: { code: "usage_not_included", message: "Usage is not included" } },
	},
	{
		name: "HTTP 429",
		response: { id: "resp_failed_http_429", status: "failed", status_code: 429, error: { message: "Too many requests" } },
	},
] as const;

for (const usageLimitCase of usageLimitCases) {
	test(`v2 compaction preserves ${usageLimitCase.name} response.failed errors for usage formatting`, async () => {
		const { response } = usageLimitCase;
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
}

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

test("v2 retained window applies Codex's final retained-history filter", () => {
	const compactionOutput = { type: "compaction", encrypted_content: "sealed" };
	const visibleUser = { role: "user", content: [{ type: "input_text", text: "real user" }] };
	const visibleHook = {
		role: "user",
		content: [{ type: "input_text", text: '<hook_prompt hook_run_id="hook-1">Retry with care.</hook_prompt>' }],
	};
	const window = buildNativeCompactionV2Window([
		{ role: "developer", content: "stale developer instructions" },
		{ role: "system", content: "stale system instructions" },
		visibleUser,
		{ role: "user", content: [{ type: "input_text", text: "<environment_context>stale context</environment_context>" }] },
		{ role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for test\n\n<INSTRUCTIONS>stale</INSTRUCTIONS>" }] },
		visibleHook,
		{ type: "message", role: "assistant", content: [{ type: "output_text", text: "assistant" }] },
		{ type: "reasoning", summary: [] },
		{ type: "function_call", call_id: "call_1", name: "exec", arguments: "{}" },
		{ type: "function_call_output", call_id: "call_1", output: "tool output" },
		{ type: "compaction_trigger" },
	], compactionOutput);

	assert.deepEqual(window, [visibleUser, visibleHook, compactionOutput]);
});

test("v2 retained window preserves mixed and pure image user messages", () => {
	const mixed = {
		role: "user",
		content: [
			{ type: "input_text", text: "keep text" },
			{ type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "original" },
		],
	};
	const imageOnly = { role: "user", content: [{ type: "input_image", image_url: "https://example.test/image.png" }] };
	const compactionOutput = { type: "compaction", encrypted_content: "sealed" };

	assert.deepEqual(buildNativeCompactionV2Window([mixed, imageOnly], compactionOutput), [mixed, imageOnly, compactionOutput]);
});

test("v2 retained window drops unknown non-text content parts", () => {
	const window = buildNativeCompactionV2Window([
		{
			role: "user",
			content: [
				{ type: "input_text", text: "keep text" },
				{ type: "audio", data: "do not retain" },
				{ type: "input_image", image_url: "https://example.test/image.png" },
			],
		},
	], { type: "compaction", encrypted_content: "sealed" });

	assert.deepEqual(window, [
		{
			role: "user",
			content: [
				{ type: "input_text", text: "keep text" },
				{ type: "input_image", image_url: "https://example.test/image.png" },
			],
		},
		{ type: "compaction", encrypted_content: "sealed" },
	]);
});

test("v2 retained window prioritizes newest messages and truncates to the remaining budget", () => {
	const old = { role: "user", content: [{ type: "input_text", text: "old" }] };
	const newestText = "token ".repeat(70_000);
	const newest = { role: "user", content: [{ type: "input_text", text: newestText }] };
	const input = [old, newest];
	const inputSnapshot = structuredClone(input);
	const compactionOutput = { type: "compaction", encrypted_content: "sealed", metadata: { opaque: true } };
	const compactionSnapshot = structuredClone(compactionOutput);

	const window = buildNativeCompactionV2Window(input, compactionOutput);
	assert.equal(window.length, 2);
	assert.equal((window[0] as any).content[0].text.length < newestText.length, true);
	assert.equal(tokenCount((window[0] as any).content[0].text), 64_000);
	assert.deepEqual(input, inputSnapshot);
	assert.deepEqual(compactionOutput, compactionSnapshot);
	assert.notStrictEqual(window.at(-1), compactionOutput);
});

test("v2 retained window shares budget across text parts and preserves images in order", () => {
	const firstText = "a ".repeat(31_999);
	const secondText = "a ".repeat(31_999);
	assert.equal(tokenCount(firstText), 32_000);
	assert.equal(tokenCount(secondText), 32_000);

	const window = buildNativeCompactionV2Window([
		{
			role: "user",
			content: [
				{ type: "input_text", text: firstText },
				{ type: "input_image", image_url: "https://example.test/before-second-text.png" },
				{ type: "output_text", text: secondText },
				{ type: "input_image", image_url: "https://example.test/after-second-text.png" },
				{ type: "input_text", text: "one-token tail" },
				{ type: "input_text", text: "" },
			],
		},
	], { type: "compaction", encrypted_content: "sealed" });

	const content = (window[0] as any).content;
	assert.deepEqual(content, [
		{ type: "input_text", text: firstText },
		{ type: "input_image", image_url: "https://example.test/before-second-text.png" },
		{ type: "output_text", text: secondText },
		{ type: "input_image", image_url: "https://example.test/after-second-text.png" },
	]);
});

test("v2 retained window keeps images before and after truncated text", () => {
	const text = "token ".repeat(70_000);
	const window = buildNativeCompactionV2Window([
		{
			role: "user",
			content: [
				{ type: "input_image", image_url: "https://example.test/before.png" },
				{ type: "input_text", text },
				{ type: "input_image", image_url: "https://example.test/after.png" },
				{ type: "input_text", text: "" },
			],
		},
	], { type: "compaction", encrypted_content: "sealed" });

	const content = (window[0] as any).content;
	assert.deepEqual(content[0], { type: "input_image", image_url: "https://example.test/before.png" });
	assert.equal(content[1].type, "input_text");
	assert.equal(content[1].text.length < text.length, true);
	assert.equal(content[2].image_url, "https://example.test/after.png");
	assert.equal(content.some((part: any) => part.type === "input_text" && part.text === ""), false);
});

test("v2 retained window charges each pure image message against the budget", () => {
	const imageMessageCount = 64_001;
	const input = Array.from({ length: imageMessageCount }, (_, index) => ({
		role: "user",
		content: [{ type: "input_image", image_url: `https://example.test/image-${index}.png` }],
	}));
	const window = buildNativeCompactionV2Window(input, { type: "compaction", encrypted_content: "sealed" });

	assert.equal(window.length, 64_001);
	assert.equal((window[0] as any).content[0].image_url, "https://example.test/image-1.png");
	assert.equal((window.at(-2) as any).content[0].image_url, "https://example.test/image-64000.png");
});

test("v2 retained window always appends an opaque compaction item", () => {
	const compactionOutput = { type: "compaction", encrypted_content: "sealed", nested: { value: 1 } };
	const window = buildNativeCompactionV2Window([{ type: "reasoning", summary: [] }], compactionOutput);

	assert.deepEqual(window, [compactionOutput]);
	assert.notStrictEqual(window[0], compactionOutput);
});
