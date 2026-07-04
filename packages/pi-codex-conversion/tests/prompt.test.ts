import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexSystemPrompt } from "../src/prompt/build-system-prompt.ts";

const BASE_PROMPT = `You are pi.

Available tools:
(none)

Guidelines:
- Be concise in your responses

Pi documentation:
- docs

Current date: 2026-07-04`;

test("Codex prompt omits write_stdin guidance when background shell sessions are disabled", () => {
	const prompt = buildCodexSystemPrompt(BASE_PROMPT, { tools: { backgroundShellSessions: false } });

	assert.match(prompt, /Background shell sessions are disabled/);
	assert.doesNotMatch(prompt, /Use write_stdin only/);
	assert.doesNotMatch(prompt, /Use tty=true for dev servers/);
});

test("Codex prompt keeps write_stdin guidance when background shell sessions are enabled", () => {
	const prompt = buildCodexSystemPrompt(BASE_PROMPT, { tools: { backgroundShellSessions: true } });

	assert.match(prompt, /Use write_stdin only/);
	assert.doesNotMatch(prompt, /Background shell sessions are disabled/);
});
