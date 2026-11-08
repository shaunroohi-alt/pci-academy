import "server-only";
import path from "node:path";
import type { ProviderId, PublicConfig } from "@/lib/shared/types";
import { PROVIDER_IDS } from "@/lib/shared/types";

// All environment access lives here so secrets never leak into client bundles
// and every other module reads a single, validated view of the config.

function str(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function bool(name: string, fallback = false): boolean {
  const v = str(name)?.toLowerCase();
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v);
}

function int(name: string, fallback: number): number {
  const v = str(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function list(name: string): string[] | undefined {
  const v = str(name);
  if (!v) return undefined;
  const items = v.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function json(name: string): Record<string, string> | undefined {
  const v = str(name);
  if (!v) return undefined;
  try {
    const parsed = JSON.parse(v);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).map(([k, val]) => [k, String(val)]));
    }
  } catch {
    console.warn(`[config] ${name} is not valid JSON; ignoring it.`);
  }
  return undefined;
}

export interface ServerConfig {
  anthropic: { apiKey?: string; baseURL?: string; models?: string[]; defaultModel?: string };
  openai: { apiKey?: string; baseURL?: string; organization?: string; models?: string[]; defaultModel?: string };
  gemini: { apiKey?: string; baseURL?: string; models?: string[]; defaultModel?: string };
  astra: {
    label: string;
    baseURL?: string;
    apiKey?: string;
    models?: string[];
    defaultModel?: string;
    headers?: Record<string, string>;
    supportsImages: boolean;
    supportsTools: boolean;
  };
  mockEnabled: boolean;
  defaultProvider?: ProviderId;
  dataDir: string;
  workspaceDir: string;
  shellEnabled: boolean;
  shellTimeoutMs: number;
  claudeCodeCli: { enabled: boolean; bin: string; args: string[] };
  rateLimitPerMinute: number;
  maxAttachmentBytes: number;
  maxAgentSteps: number;
  appPassword?: string;
}

export function getConfig(): ServerConfig {
  const defaultProvider = str("DEFAULT_PROVIDER") as ProviderId | undefined;
  return {
    anthropic: {
      apiKey: str("ANTHROPIC_API_KEY"),
      baseURL: str("ANTHROPIC_BASE_URL"),
      models: list("ANTHROPIC_MODELS"),
      defaultModel: str("ANTHROPIC_DEFAULT_MODEL"),
    },
    openai: {
      apiKey: str("OPENAI_API_KEY"),
      baseURL: str("OPENAI_BASE_URL"),
      organization: str("OPENAI_ORG_ID"),
      models: list("OPENAI_MODELS"),
      defaultModel: str("OPENAI_DEFAULT_MODEL"),
    },
    gemini: {
      apiKey: str("GEMINI_API_KEY") ?? str("GOOGLE_API_KEY"),
      baseURL: str("GEMINI_BASE_URL"),
      models: list("GEMINI_MODELS"),
      defaultModel: str("GEMINI_DEFAULT_MODEL"),
    },
    astra: {
      label: str("ASTRA_LABEL") ?? "Astra",
      baseURL: str("ASTRA_BASE_URL"),
      apiKey: str("ASTRA_API_KEY"),
      models: list("ASTRA_MODELS"),
      defaultModel: str("ASTRA_DEFAULT_MODEL"),
      headers: json("ASTRA_HEADERS"),
      supportsImages: bool("ASTRA_SUPPORTS_IMAGES", false),
      supportsTools: bool("ASTRA_SUPPORTS_TOOLS", false),
    },
    mockEnabled: bool("ENABLE_MOCK_PROVIDER", false),
    defaultProvider: defaultProvider && PROVIDER_IDS.includes(defaultProvider) ? defaultProvider : undefined,
    dataDir: path.resolve(/*turbopackIgnore: true*/ str("DATA_DIR") ?? "./data"),
    workspaceDir: path.resolve(/*turbopackIgnore: true*/ str("WORKSPACE_DIR") ?? "./workspace"),
    shellEnabled: bool("ENABLE_SHELL", false),
    shellTimeoutMs: int("SHELL_TIMEOUT_MS", 60_000),
    claudeCodeCli: {
      enabled: bool("ENABLE_CLAUDE_CODE_CLI", false),
      bin: str("CLAUDE_CODE_BIN") ?? "claude",
      args: (str("CLAUDE_CODE_ARGS") ?? "--permission-mode acceptEdits").split(/\s+/).filter(Boolean),
    },
    rateLimitPerMinute: int("RATE_LIMIT_PER_MINUTE", 30),
    maxAttachmentBytes: int("MAX_ATTACHMENT_MB", 10) * 1024 * 1024,
    maxAgentSteps: int("MAX_AGENT_STEPS", 25),
    appPassword: str("APP_PASSWORD"),
  };
}

export function getPublicConfig(): PublicConfig {
  const c = getConfig();
  return {
    appName: str("APP_NAME") ?? "Switchboard",
    shellEnabled: c.shellEnabled,
    claudeCodeCliEnabled: c.claudeCodeCli.enabled,
    maxAttachmentBytes: c.maxAttachmentBytes,
    defaultProvider: c.defaultProvider,
    defaultModel: str("DEFAULT_MODEL"),
    astraLabel: c.astra.label,
  };
}
