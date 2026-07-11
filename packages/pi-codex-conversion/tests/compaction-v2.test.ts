import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeCompactionV2Window, executeNativeCompactionV2 } from "../src/adapter/compaction/v2-client.ts";

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
