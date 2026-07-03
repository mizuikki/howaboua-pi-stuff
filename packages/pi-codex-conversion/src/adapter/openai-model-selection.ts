import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { OpenAIModelSelection } from "./activation/config.ts";
import { OPENAI_CODEX_PROVIDER } from "./codex-provider-constants.ts";

type RuntimeModel = Model<Api>;

export type ModelRegistryLike = {
	find?: (provider: string, modelId: string) => RuntimeModel | undefined;
	getAvailable?: () => RuntimeModel[];
	getAll?: () => RuntimeModel[];
};

function normalizeModelId(value: string | undefined | null): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

function isLikelyCodexModelId(modelId: string): boolean {
	const lower = modelId.trim().toLowerCase();
	return lower.startsWith("gpt-") || lower.includes("codex");
}

function modelRegistry(ctx: ExtensionContext): ModelRegistryLike {
	return ctx.modelRegistry as ModelRegistryLike;
}

export function findModelInRegistry(
	ctx: ExtensionContext,
	provider: string,
	modelId: string,
): RuntimeModel | undefined {
	return modelRegistry(ctx).find?.(provider, modelId);
}

export function resolveWebSearchModelSelection(
	ctx: ExtensionContext,
	selection: OpenAIModelSelection | undefined,
	fallbackModel: string | undefined,
): string | undefined {
	if (!selection) return normalizeModelId(fallbackModel);
	if (selection !== "current") return normalizeModelId(selection);
	const currentModelId = normalizeModelId(ctx.model?.id);
	if (currentModelId && isLikelyCodexModelId(currentModelId)) return currentModelId;
	return normalizeModelId(fallbackModel);
}

export function resolveCompactionTargetModel(
	ctx: ExtensionContext,
	currentModel: RuntimeModel,
	selection: OpenAIModelSelection,
): RuntimeModel {
	if (selection === "current") return currentModel;
	const selectedModel = findModelInRegistry(ctx, currentModel.provider, selection);
	return selectedModel ?? { ...currentModel, id: selection };
}

export function firstUsableOpenAICodexModel(
	ctx: ExtensionContext,
	modelIds: readonly string[],
	isUsableModel: (model: ExtensionContext["model"]) => boolean,
): RuntimeModel | undefined {
	const registry = modelRegistry(ctx);
	const direct = modelIds
		.map((modelId) => registry.find?.(OPENAI_CODEX_PROVIDER, modelId))
		.find((model): model is RuntimeModel => Boolean(model && isUsableModel(model)));
	if (direct) return direct;
	const available = registry.getAvailable?.();
	if (available) {
		const preferred = available.find((model) => isUsableModel(model));
		if (preferred) return preferred;
	}
	const all = registry.getAll?.();
	return all?.find((model) => isUsableModel(model));
}
