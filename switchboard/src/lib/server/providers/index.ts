import "server-only";
import { getConfig, list } from "@/lib/server/config";
import type { ModelInfo, ProviderId, ProviderStatus } from "@/lib/shared/types";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { OPENAI_DEFAULT_MODELS, OpenAICompatibleProvider } from "./openai-compatible";
import type { ChatProvider } from "./types";

let cache: { key: string; providers: Map<ProviderId, ChatProvider> } | null = null;

/** Build providers from env. Rebuilt only when the relevant env changes. */
export function getProviders(): Map<ProviderId, ChatProvider> {
  const cfg = getConfig();
  const key = JSON.stringify([cfg.anthropic, cfg.openai, cfg.gemini, cfg.astra, cfg.mockEnabled, process.env.ANTHROPIC_REFUSAL_FALLBACK]);
  if (cache?.key === key) return cache.providers;

  const providers = new Map<ProviderId, ChatProvider>();
  providers.set("anthropic", new AnthropicProvider(cfg.anthropic, process.env.ANTHROPIC_REFUSAL_FALLBACK !== "false"));
  providers.set(
    "openai",
    new OpenAICompatibleProvider({
      id: "openai",
      label: "OpenAI",
      apiKey: cfg.openai.apiKey,
      baseURL: cfg.openai.baseURL,
      organization: cfg.openai.organization,
      models: cfg.openai.models,
      defaultModel: cfg.openai.defaultModel,
      capabilities: { images: true, pdf: true, tools: true },
      tokenParam: "max_completion_tokens",
      requiresKey: true,
      defaults: OPENAI_DEFAULT_MODELS,
    }),
  );
  providers.set("gemini", new GeminiProvider(cfg.gemini));
  providers.set(
    "astra",
    new OpenAICompatibleProvider({
      id: "astra",
      label: cfg.astra.label,
      apiKey: cfg.astra.apiKey,
      baseURL: cfg.astra.baseURL,
      headers: cfg.astra.headers,
      models: cfg.astra.models,
      defaultModel: cfg.astra.defaultModel,
      capabilities: { images: cfg.astra.supportsImages, pdf: false, tools: cfg.astra.supportsTools },
      tokenParam: "max_tokens",
      requiresKey: false,
      defaults: list("ASTRA_MODELS") ?? [],
    }),
  );
  if (cfg.mockEnabled) providers.set("mock", new MockProvider());
  cache = { key, providers };
  return providers;
}

export function getProvider(id: string): ChatProvider | undefined {
  return getProviders().get(id as ProviderId);
}

const modelCache = new Map<ProviderId, { at: number; models: ModelInfo[] }>();
const MODEL_TTL_MS = 10 * 60_000;

/**
 * Status for every provider. Model lists are fetched live (and cached) when
 * the provider is configured and no explicit env list was given; otherwise the
 * env list or built-in defaults are used.
 */
export async function providerStatuses(opts: { live?: boolean } = {}): Promise<ProviderStatus[]> {
  const live = opts.live ?? true;
  return Promise.all(
    [...getProviders().values()].map(async (p): Promise<ProviderStatus> => {
      const fallback = p.fallbackModels();
      let models = fallback.models;
      let modelSource: ProviderStatus["modelSource"] = fallback.source;
      let note = p.note?.();
      if (live && p.configured() && fallback.source !== "env" && p.fetchModels) {
        const cached = modelCache.get(p.id);
        if (cached && Date.now() - cached.at < MODEL_TTL_MS) {
          models = cached.models;
          modelSource = "api";
        } else {
          try {
            const fetched = await withTimeout(p.fetchModels(), 8_000);
            if (fetched.length) {
              models = fetched;
              modelSource = "api";
              modelCache.set(p.id, { at: Date.now(), models });
            }
          } catch (e) {
            note = `Live model list unavailable (${(e as Error).message?.slice(0, 120)}); showing ${fallback.source} list.`;
          }
        }
      }
      const def = p.defaultModel();
      // Make sure the configured default is always selectable.
      if (def && !models.some((m) => m.id === def)) models = [{ id: def, label: def }, ...models];
      return {
        id: p.id,
        label: p.label,
        configured: p.configured(),
        capabilities: p.capabilities,
        models,
        modelSource,
        defaultModel: def,
        note,
      };
    }),
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
