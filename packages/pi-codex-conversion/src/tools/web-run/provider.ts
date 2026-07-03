import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WebSearchAuthMode } from "../../adapter/activation/config.ts";
import {
	codexToolProviderEnv,
	configuredResponsesToolProviderEnv,
	isConfiguredOpenAIResponsesModel,
	resolveCodexToolProvider,
	resolveConfiguredResponsesToolProvider,
} from "../../adapter/codex-tool-provider.ts";

export interface WebRunToolProvider {
	model: string | undefined;
	env: NodeJS.ProcessEnv;
	pathEnv: NodeJS.ProcessEnv;
}

export interface WebRunProviderOptions {
	allowConfiguredProvider?: ((model: ExtensionContext["model"]) => boolean) | undefined;
	authMode?: WebSearchAuthMode | undefined;
}

function supportsNativeWebRunProvider(model: ExtensionContext["model"]): boolean {
	return (model?.provider ?? "").toLowerCase() === "openai-codex" && Boolean(model?.api?.includes("responses"));
}

function pickPathEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return Object.fromEntries([
		"PI_CODEX_AUTH_MODE",
		"PI_CODEX_ACCESS_TOKEN",
		"PI_CODEX_ACCOUNT_ID",
		"PI_CODEX_BASE_URL",
		"PI_CODEX_RESPONSES_URL",
		"PI_CODEX_MODEL",
		"PI_CODEX_PROVIDER_HEADERS",
	].flatMap((key) => env[key] ? [[key, env[key]!]] : []));
}

export async function resolveWebRunToolProvider(ctx: ExtensionContext, options: WebRunProviderOptions = {}): Promise<WebRunToolProvider> {
	if (options.authMode === "codex") {
		const provider = await resolveCodexToolProvider(ctx);
		const env = codexToolProviderEnv(provider);
		return { model: provider.model, env, pathEnv: pickPathEnv(env) };
	}
	if (supportsNativeWebRunProvider(ctx.model)) {
		const provider = await resolveCodexToolProvider(ctx);
		const env = codexToolProviderEnv(provider);
		return { model: provider.model, env, pathEnv: pickPathEnv(env) };
	}
	if (options.allowConfiguredProvider?.(ctx.model) && isConfiguredOpenAIResponsesModel(ctx.model)) {
		const provider = await resolveConfiguredResponsesToolProvider(ctx);
		const env = configuredResponsesToolProviderEnv(provider);
		return { model: provider.model, env, pathEnv: pickPathEnv(env) };
	}
	const provider = await resolveCodexToolProvider(ctx);
	const env = codexToolProviderEnv(provider);
	return { model: provider.model, env, pathEnv: pickPathEnv(env) };
}
