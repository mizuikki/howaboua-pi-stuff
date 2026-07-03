import test from "node:test";
import assert from "node:assert/strict";
import type { Model } from "@earendil-works/pi-ai";
import { normalizeCodexConversionConfig } from "../src/adapter/activation/config.ts";
import { resolveCompactionTargetModel, resolveWebSearchModelSelection } from "../src/adapter/openai-model-selection.ts";

function context(model: Model<any> | Record<string, unknown>, registry: { find?: (provider: string, modelId: string) => Model<any> | undefined } = {}) {
	return {
		model,
		modelRegistry: registry,
	} as never;
}

test("grouped config accepts current and gpt-5.4 model selections", () => {
	const config = normalizeCodexConversionConfig({
		openai: {
			webSearchModel: "current",
			compactionModel: "gpt-5.4",
		},
	});

	assert.equal(config.openai.webSearchModel, "current");
	assert.equal(config.openai.compactionModel, "gpt-5.4");
});

test("web search current selection follows GPT models and falls back for non-Codex ids", () => {
	assert.equal(
		resolveWebSearchModelSelection(
			context({ id: "gpt-5.4", provider: "cch-responses", api: "openai-responses" }),
			"current",
			"gpt-5.4-mini",
		),
		"gpt-5.4",
	);

	assert.equal(
		resolveWebSearchModelSelection(
			context({ id: "deepseek-v4", provider: "cch-messages", api: "anthropic-messages" }),
			"current",
			"gpt-5.4-mini",
		),
		"gpt-5.4-mini",
	);
});

test("compaction model selection follows current or registry metadata", () => {
	const currentModel = {
		id: "gpt-5.4-mini",
		provider: "cch-responses",
		api: "openai-responses",
		baseUrl: "http://example.test/v1",
		reasoning: true,
		contextWindow: 128_000,
		thinkingLevelMap: { xhigh: "xhigh" },
		input: ["text"],
	} as Model<any>;
	const selectedModel = {
		...currentModel,
		id: "gpt-5.4",
		contextWindow: 272_000,
	} as Model<any>;
	const ctx = context(currentModel, {
		find(provider, modelId) {
			return provider === "cch-responses" && modelId === "gpt-5.4" ? selectedModel : undefined;
		},
	});

	assert.equal(resolveCompactionTargetModel(ctx, currentModel, "current"), currentModel);
	assert.equal(resolveCompactionTargetModel(ctx, currentModel, "gpt-5.4"), selectedModel);
});
