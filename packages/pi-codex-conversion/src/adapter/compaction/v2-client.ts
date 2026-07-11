import { Tiktoken } from "js-tiktoken/lite";
import o200kBaseRanks from "js-tiktoken/ranks/o200k_base";
import type { NativeCompactionRuntime } from "./compaction-runtime.ts";
import type { NativeCompactionRequestBody } from "./serializer.ts";

const JSON_CONTENT_TYPE = "application/json";
const RETAINED_MESSAGE_TOKEN_BUDGET = 64_000;
const DEFAULT_COMPACTION_IDLE_TIMEOUT_MS = 120_000;
const COMPACTION_TRIGGER = { type: "compaction_trigger" } as const;

let compactionTokenEncoding: Tiktoken | undefined;

function getCompactionTokenEncoding(): Tiktoken {
	compactionTokenEncoding ??= new Tiktoken(o200kBaseRanks);
	return compactionTokenEncoding;
}

type CompactionStreamEvent = {
	type?: unknown;
	item?: unknown;
	response?: { id?: unknown; created_at?: unknown; status?: unknown } | undefined;
};

export type NativeCompactionV2FailureReason =
	| "aborted"
	| "network-error"
	| "non-2xx"
	| "empty-body"
	| "invalid-stream"
	| "missing-completion"
	| "invalid-output";

export type NativeCompactionV2Success = {
	ok: true;
	status: number;
	compactedWindow: unknown[];
	compactResponseId?: string | undefined;
	createdAt?: string | undefined;
};

export type NativeCompactionV2Failure = {
	ok: false;
	reason: NativeCompactionV2FailureReason;
	status?: number | undefined;
	errorMessage?: string | undefined;
	responseText?: string | undefined;
	responseJson?: unknown | undefined;
};

export type NativeCompactionV2Result = NativeCompactionV2Success | NativeCompactionV2Failure;

export type ExecuteNativeCompactionV2Options = {
	runtime: NativeCompactionRuntime;
	request: NativeCompactionRequestBody;
	signal?: AbortSignal | undefined;
	sessionId?: string | undefined;
	idleTimeoutMs?: number | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && (error.name === "AbortError" || error.name === "ABORT_ERR"))
	);
}

function normalizeResponseTimestamp(value: unknown): string | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
		return new Date(milliseconds).toISOString();
	}

	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? trimmed : new Date(parsed).toISOString();
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
	const parts = token.split(".");
	if (parts.length !== 3) return undefined;
	try {
		const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
		return isRecord(payload) ? payload : undefined;
	} catch {
		return undefined;
	}
}

function extractCodexAccountId(token: string): string | undefined {
	const authClaims = decodeJwtPayload(token)?.["https://api.openai.com/auth"];
	if (!isRecord(authClaims)) return undefined;
	const accountId = authClaims["chatgpt_account_id"];
	return typeof accountId === "string" && accountId.trim() ? accountId.trim() : undefined;
}

function buildCodexUserAgent(): string {
	const platform = typeof process !== "undefined" ? process.platform : "browser";
	const arch = typeof process !== "undefined" ? process.arch : "unknown";
	return `pi (${platform}; ${arch})`;
}

function extractBearerToken(headers: Headers): string | undefined {
	const match = headers.get("authorization")?.trim().match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || undefined;
}

function toHeaders(runtime: NativeCompactionRuntime, sessionId: string | undefined): Record<string, string> {
	const headers = new Headers(runtime.currentModel.headers ?? {});
	for (const [key, value] of Object.entries(runtime.headers ?? {})) headers.set(key, value);
	headers.set("accept", "text/event-stream");
	headers.set("content-type", JSON_CONTENT_TYPE);
	if (runtime.apiKey) headers.set("authorization", `Bearer ${runtime.apiKey}`);

	if (runtime.provider === "openai-codex") {
		const accountId = extractCodexAccountId(runtime.apiKey ?? extractBearerToken(headers) ?? "");
		if (accountId) headers.set("chatgpt-account-id", accountId);
		headers.set("originator", "pi");
		headers.set("user-agent", buildCodexUserAgent());
		headers.set("openai-beta", "responses=experimental");
		headers.set("x-codex-beta-features", "remote_compaction_v2");
		if (sessionId) {
			headers.set("session-id", sessionId);
			headers.set("x-client-request-id", sessionId);
		}
	}

	return Object.fromEntries(headers.entries());
}

function buildCodexCompactionMetadata(sessionId: string | undefined): Record<string, string> | undefined {
	if (!sessionId) return undefined;
	return {
		"x-codex-window-id": sessionId,
		"x-codex-turn-metadata": JSON.stringify({
			session_id: sessionId,
			thread_id: sessionId,
			window_id: sessionId,
			request_kind: "compaction",
			compaction: {
				trigger: "manual",
				reason: "user_requested",
				implementation: "responses_compaction_v2",
				phase: "standalone_turn",
				strategy: "memento",
			},
		}),
	};
}

function isRetainedMessage(item: unknown): item is Record<string, unknown> {
	return isRecord(item) && item["role"] === "user";
}

function estimateMessageTokens(item: Record<string, unknown>): number {
	const content = item["content"];
	const text = typeof content === "string"
		? content
		: Array.isArray(content)
			? content
				.filter(isRecord)
				.map((part) => (part["type"] === "input_text" || part["type"] === "output_text") && typeof part["text"] === "string" ? part["text"] : "")
				.join("")
				: "";
	try {
		return getCompactionTokenEncoding().encode(text).length;
	} catch {
		return Math.ceil(text.length / 2);
	}
}

function truncateText(text: string, tokenBudget: number): string {
	if (tokenBudget <= 0) return "";
	try {
		const encoding = getCompactionTokenEncoding();
		const tokens = encoding.encode(text);
		if (tokens.length <= tokenBudget) return text;
		return encoding.decode(tokens.slice(0, tokenBudget));
	} catch {
		return text.slice(0, tokenBudget * 2);
	}
}

function truncateRetainedMessage(item: Record<string, unknown>, tokenBudget: number): Record<string, unknown> | undefined {
	const clone = structuredClone(item);
	const content = clone["content"];
	if (typeof content === "string") {
		const text = truncateText(content, tokenBudget);
		return text ? { ...clone, content: text } : undefined;
	}
	if (!Array.isArray(content)) return undefined;

	let remaining = tokenBudget;
	const truncatedContent: unknown[] = [];
	for (const part of content) {
		if (!isRecord(part)) continue;
		if ((part["type"] === "input_text" || part["type"] === "output_text") && typeof part["text"] === "string") {
			if (remaining === 0) continue;
			const originalTokens = estimateMessageTokens({ content: [part] });
			const text = truncateText(part["text"], remaining);
			if (!text) continue;
			truncatedContent.push({ ...part, text });
			remaining = Math.max(0, remaining - Math.min(originalTokens, remaining));
			continue;
		}
	}
	return truncatedContent.length > 0 ? { ...clone, content: truncatedContent } : undefined;
}

function retainTextContentOnly(item: Record<string, unknown>): Record<string, unknown> | undefined {
	const content = item["content"];
	if (typeof content === "string") return structuredClone(item);
	if (!Array.isArray(content)) return undefined;
	const textContent = content.filter(
		(part) => isRecord(part) && (part["type"] === "input_text" || part["type"] === "output_text") && typeof part["text"] === "string",
	);
	return textContent.length > 0 ? { ...structuredClone(item), content: textContent } : undefined;
}

export function buildNativeCompactionV2Window(input: readonly unknown[], compactionOutput: unknown): unknown[] {
	const retainedReversed: Record<string, unknown>[] = [];
	let remaining = RETAINED_MESSAGE_TOKEN_BUDGET;
	for (let index = input.length - 1; index >= 0 && remaining > 0; index--) {
		const item = input[index]!;
		if (!isRetainedMessage(item)) continue;
		const retainedItem = retainTextContentOnly(item);
		if (!retainedItem) continue;
		const tokens = Math.max(1, estimateMessageTokens(retainedItem));
		if (tokens <= remaining) {
			retainedReversed.push(retainedItem);
			remaining -= tokens;
			continue;
		}
		const truncated = truncateRetainedMessage(retainedItem, remaining);
		if (truncated) retainedReversed.push(truncated);
		remaining = 0;
	}
	retainedReversed.reverse();
	return [...retainedReversed, structuredClone(compactionOutput)];
}

async function* parseSSE(
	response: Response,
	signal: AbortSignal | undefined,
	idleTimeoutMs: number,
): AsyncIterable<CompactionStreamEvent> {
	if (!response.body) return;

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const onAbort = () => void reader.cancel().catch(() => {});
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		while (true) {
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const read = reader.read();
			const idleTimeout = new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					reject(new Error(`Compaction SSE idle timeout after ${idleTimeoutMs}ms`));
					void reader.cancel().catch(() => {});
				}, idleTimeoutMs);
			});
			let readResult: Awaited<ReturnType<typeof reader.read>>;
			try {
				readResult = await Promise.race([read, idleTimeout]);
			} finally {
				if (timeout) clearTimeout(timeout);
			}
			const { done, value } = readResult;
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const chunk = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				const data = chunk
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trim())
					.join("\n")
					.trim();
				if (data && data !== "[DONE]") {
					try {
						yield JSON.parse(data) as CompactionStreamEvent;
					} catch (error) {
						throw new Error(`Invalid compaction SSE JSON: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
				boundary = buffer.indexOf("\n\n");
			}
		}
	} finally {
		signal?.removeEventListener("abort", onAbort);
		try { await reader.cancel(); } catch {}
		try { reader.releaseLock(); } catch {}
	}
}

export async function executeNativeCompactionV2(
	options: ExecuteNativeCompactionV2Options,
): Promise<NativeCompactionV2Result> {
	const { runtime, request, signal, sessionId, idleTimeoutMs = DEFAULT_COMPACTION_IDLE_TIMEOUT_MS } = options;
	if (signal?.aborted) return { ok: false, reason: "aborted" };

	try {
		const clientMetadata = runtime.provider === "openai-codex" ? buildCodexCompactionMetadata(sessionId) : undefined;
		const response = await fetch(runtime.responsesUrl, {
			method: "POST",
			headers: toHeaders(runtime, sessionId),
			body: JSON.stringify({
				...request,
				input: [...request.input, COMPACTION_TRIGGER],
				store: false,
				stream: true,
				include: ["reasoning.encrypted_content"],
				tool_choice: "auto",
				...(clientMetadata ? { client_metadata: clientMetadata } : {}),
			}),
			...(signal ? { signal } : {}),
		});

		if (!response.ok) {
			const responseText = await response.text();
			let responseJson: unknown;
			try { responseJson = responseText.trim() ? JSON.parse(responseText) : undefined; } catch {}
			return { ok: false, reason: "non-2xx", status: response.status, responseText: responseText || undefined, responseJson };
		}

		if (!response.body) return { ok: false, reason: "empty-body", status: response.status };

		let sawCompleted = false;
		let compactResponseId: string | undefined;
		let createdAt: string | undefined;
		const compactionItems: Record<string, unknown>[] = [];
		try {
			for await (const event of parseSSE(response, signal, idleTimeoutMs)) {
				if (event.type === "response.output_item.done" && isRecord(event.item) && (event.item["type"] === "compaction" || event.item["type"] === "context_compaction")) {
					compactionItems.push(event.item);
				}
				if (event.type === "response.completed" || event.type === "response.done") {
					const status = typeof event.response?.status === "string" ? event.response.status : undefined;
					if (status && status !== "completed") {
						return { ok: false, reason: "invalid-output", status: response.status, errorMessage: `Compaction response ended with status ${status}` };
					}
					sawCompleted = true;
					compactResponseId = typeof event.response?.id === "string" && event.response.id.trim() ? event.response.id.trim() : undefined;
					createdAt = normalizeResponseTimestamp(event.response?.created_at);
					break;
				}
			}
		} catch (error) {
			if (isAbortError(error)) return { ok: false, reason: "aborted" };
			return { ok: false, reason: "invalid-stream", status: response.status, errorMessage: error instanceof Error ? error.message : String(error) };
		}

		if (!sawCompleted) return { ok: false, reason: "missing-completion", status: response.status };
		if (compactionItems.length !== 1) return { ok: false, reason: "invalid-output", status: response.status, errorMessage: `Expected exactly one compaction item, got ${compactionItems.length}` };

		return {
			ok: true,
			status: response.status,
			compactedWindow: buildNativeCompactionV2Window(request.input, compactionItems[0]!),
			compactResponseId,
			createdAt,
		};
	} catch (error) {
		return isAbortError(error)
			? { ok: false, reason: "aborted" }
			: { ok: false, reason: "network-error", errorMessage: error instanceof Error ? error.message : String(error) };
	}
}
