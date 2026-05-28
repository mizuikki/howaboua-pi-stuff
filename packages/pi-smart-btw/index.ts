import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { ensureConfig, readConfig } from "./src/config.js";
import { BtwChild } from "./src/rpc-child.js";
import type { BtwTurn } from "./src/types.js";

const WIDGET_ID = "smart-btw";
const MESSAGE_TYPE = "smart-btw-result";
const FALLBACK_COMPOSE_SHORTCUT = "alt+z";
const FALLBACK_INJECT_SHORTCUT = "alt+c";
const FALLBACK_DISMISS_SHORTCUT = "alt+x";

type State = {
	child: BtwChild | undefined;
	turns: BtwTurn[];
	running: boolean;
	queue: Promise<void>;
	ctx?: ExtensionCommandContext;
};

function doneTurns(turns: BtwTurn[]) {
	return turns.filter((turn) => turn.answer || turn.error);
}

function injectionText(turns: BtwTurn[]) {
	const completed = doneTurns(turns);
	if (completed.length === 1) {
		const turn = completed[0]!;
		return [
			"The user asked the following question in a separate session:",
			turn.question,
			"The answer was:",
			turn.answer || turn.error || "(no answer)",
			"Take it into account while executing the current task.",
		].join("\n");
	}

	return [
		"The user asked the following questions in a separate session:",
		...completed.flatMap((turn, index) => [
			"",
			`Question ${index + 1}:`,
			turn.question,
			"Answer:",
			turn.answer || turn.error || "(no answer)",
		]),
		"",
		"Take them into account while executing the current task.",
	].join("\n");
}

function render(ctx: ExtensionCommandContext, state: State) {
	const t = ctx.ui.theme;
	if (!state.child && state.turns.length === 0) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}
	const cfg = readConfig();
	const lines: string[] = [];
	const status = state.running
		? t.fg("warning", "running")
		: t.fg("success", "ready");
	lines.push(
		`${t.fg("accent", "╭─ btw")} ${status} ${t.fg("dim", `${cfg.model}:${cfg.thinking}`)}`,
	);
	for (const turn of state.turns.slice(-3)) {
		const q =
			turn.question.length > 120
				? `${turn.question.slice(0, 117)}...`
				: turn.question;
		lines.push(`${t.fg("muted", "│ Q")} ${q}`);
		if (turn.error)
			lines.push(
				`${t.fg("error", "│ ✗ failed — see btw result in transcript")}`,
			);
		else if (turn.answer)
			lines.push(
				`${t.fg("success", "│ ✓ answered — see btw result in transcript")}`,
			);
		else lines.push(`${t.fg("warning", "│ … thinking")}`);
	}
	lines.push(
		`${t.fg("muted", "╰─")} ${FALLBACK_COMPOSE_SHORTCUT} compose · ${FALLBACK_INJECT_SHORTCUT} inject · ${FALLBACK_DISMISS_SHORTCUT} dismiss`,
	);
	ctx.ui.setWidget(WIDGET_ID, lines, { placement: "aboveEditor" });
}

function sendResultMessage(pi: ExtensionAPI, turn: BtwTurn) {
	pi.sendMessage({
		customType: MESSAGE_TYPE,
		content: turn.answer || turn.error || "(no answer)",
		display: true,
		details: {
			question: turn.question,
			answer: turn.answer,
			error: turn.error,
			startedAt: turn.startedAt,
			finishedAt: turn.finishedAt,
		},
	});
}

export default function (pi: ExtensionAPI) {
	if (process.env["PI_SMART_BTW_CHILD"] === "1") return;
	ensureConfig();
	pi.registerMessageRenderer(MESSAGE_TYPE, (message, _options, theme) => {
		const details = message.details as
			| { question?: string; answer?: string; error?: string }
			| undefined;
		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		const status = details?.error
			? theme.fg("error", "btw failed")
			: theme.fg("accent", "btw");
		const question = details?.question ?? "";
		const body =
			details?.answer ?? details?.error ?? String(message.content ?? "");
		box.addChild(
			new Text(
				`${status} ${theme.fg("muted", "Q")} ${question}\n\n${body}`,
				0,
				0,
			),
		);
		return box;
	});

	pi.on("context", async (event) => ({
		messages: event.messages.filter((message) => {
			const candidate = message as { role?: string; customType?: string };
			return !(
				candidate.role === "custom" && candidate.customType === MESSAGE_TYPE
			);
		}),
	}));
	const state: State = {
		child: undefined,
		turns: [],
		running: false,
		queue: Promise.resolve(),
	};

	const dismiss = async () => {
		await state.child?.stop();
		state.child = undefined;
		state.turns = [];
		state.running = false;
		state.ctx?.ui.setWidget(WIDGET_ID, undefined);
	};

	const inject = () => {
		const turns = doneTurns(state.turns);
		if (turns.length === 0) {
			state.ctx?.ui.notify("No /btw answer to inject yet.", "warning");
			return;
		}
		pi.sendUserMessage(
			injectionText(turns),
			state.ctx?.isIdle() ? undefined : { deliverAs: "followUp" },
		);
	};

	readConfig();
	pi.registerShortcut(FALLBACK_COMPOSE_SHORTCUT as any, {
		description: "Prefill /btw in the prompt editor",
		handler: async (ctx) => {
			const current = ctx.ui.getEditorText();
			const prefix = current.trim() ? `${current.trimEnd()} /btw ` : "/btw ";
			ctx.ui.setEditorText(prefix);
		},
	});

	pi.registerShortcut(FALLBACK_INJECT_SHORTCUT as any, {
		description: "Inject latest /btw answer into the main session",
		handler: async () => inject(),
	});
	pi.registerShortcut(FALLBACK_DISMISS_SHORTCUT as any, {
		description: "Dismiss active /btw block",
		handler: async () => {
			await dismiss();
		},
	});

	pi.registerCommand("btw", {
		description:
			"Ask a fresh async side-session question. Re-run while open to ask a follow-up. UI: inject/dismiss shortcuts shown in the btw block.",
		handler: async (args, ctx) => {
			const question = args.trim();
			state.ctx = ctx;
			if (!question) {
				ctx.ui.notify("Usage: /btw <question>", "warning");
				return;
			}
			const turn: BtwTurn = { question, startedAt: Date.now() };
			state.turns.push(turn);
			render(ctx, state);

			state.queue = state.queue.then(async () => {
				state.running = true;
				render(ctx, state);
				try {
					if (!state.child) {
						state.child = new BtwChild(ctx.cwd, () => render(ctx, state));
						await state.child.ready();
					}
					turn.answer = (await state.child.ask(question)) || "(no answer)";
				} catch (error) {
					turn.error = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`/btw failed: ${turn.error}`, "error");
				} finally {
					turn.finishedAt = Date.now();
					state.running = false;
					render(ctx, state);
					if (turn.answer || turn.error) sendResultMessage(pi, turn);
				}
			});
		},
	});

	pi.on("session_shutdown", async () => {
		await state.child?.stop();
	});
}
