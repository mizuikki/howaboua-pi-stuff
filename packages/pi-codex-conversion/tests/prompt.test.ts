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

test("Codex prompt removes stale session guidance when disabled guideline already exists", () => {
	const basePrompt = BASE_PROMPT.replace(
		"- Be concise in your responses",
		[
			"- Be concise in your responses",
			"- Use write_stdin only for running exec_command sessions; poll sparingly.",
			"- Background shell sessions are disabled; do not use write_stdin or start long-running/interactive commands expecting a session_id. Use bounded foreground exec_command calls.",
		].join("\n"),
	);
	const prompt = buildCodexSystemPrompt(basePrompt, { tools: { backgroundShellSessions: false } });

	assert.doesNotMatch(prompt, /Use write_stdin only/);
	assert.equal(prompt.match(/Background shell sessions are disabled/g)?.length, 1);
});
