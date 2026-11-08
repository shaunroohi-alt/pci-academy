import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { ProviderError } from "@/lib/server/errors";
import type { ModelInfo, ProviderCapabilities, ProviderId, StreamEvent } from "@/lib/shared/types";
import { normalizeHistory, textFileBlock, unsupportedNote, type Turn } from "./history";
import type { AgentInput, AgentSession, ChatInput, ChatProvider, ToolCall } from "./types";
import { modelsFrom } from "./types";

export const OPENAI_DEFAULT_MODELS = ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1", "gpt-4o", "o4-mini"];

/** Chat-capable model ids from OpenAI's /models listing (which also includes embeddings, TTS, …). */
export function isOpenAIChatModel(id: string): boolean {
  if (!/^(gpt-|o\d|chatgpt-)/.test(id)) return false;
  return !/(audio|realtime|tts|transcribe|image|embedding|search|instruct|moderation|dall-e|whisper|codex)/.test(id);
}

export interface OpenAICompatibleOptions {
  id: Extract<ProviderId, "openai" | "astra">;
  label: string;
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  headers?: Record<string, string>;
  models?: string[];
  defaultModel?: string;
  capabilities: ProviderCapabilities;
  /** OpenAI proper uses max_completion_tokens; generic servers usually expect max_tokens. */
  tokenParam: "max_completion_tokens" | "max_tokens";
  /** Needs a key to be considered configured (OpenAI yes; local endpoints often not). */
  requiresKey: boolean;
  defaults: string[];
}

export function toOpenAIContent(turn: Turn, caps: ProviderCapabilities, label: string): string | ChatCompletionContentPart[] {
  if (turn.attachments.length === 0) return turn.text;
  const parts: ChatCompletionContentPart[] = [];
  for (const a of turn.attachments) {
    if (a.kind === "image" && caps.images) {
      parts.push({ type: "image_url", image_url: { url: `data:${a.mimeType};base64,${a.data}` } });
    } else if (a.kind === "pdf" && caps.pdf) {
      parts.push({ type: "file", file: { filename: a.name, file_data: `data:application/pdf;base64,${a.data}` } });
    } else if (a.kind === "text") {
      parts.push({ type: "text", text: textFileBlock(a) });
    } else {
      parts.push({ type: "text", text: unsupportedNote(a, label) });
    }
  }
  if (turn.text.trim()) parts.push({ type: "text", text: turn.text });
  return parts;
}

export function toOpenAIMessages(
  system: string | undefined,
  turns: Turn[],
  caps: ProviderCapabilities,
  label: string,
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (system?.trim()) out.push({ role: "system", content: system });
  for (const t of turns) {
    out.push(
      t.role === "assistant"
        ? { role: "assistant", content: t.text }
        : { role: "user", content: toOpenAIContent(t, caps, label) },
    );
  }
  return out;
}

export class OpenAICompatibleProvider implements ChatProvider {
  id: Extract<ProviderId, "openai" | "astra">;
  label: string;
  capabilities: ProviderCapabilities;
  private client: OpenAI | null = null;

  constructor(private opts: OpenAICompatibleOptions) {
    this.id = opts.id;
    this.label = opts.label;
    this.capabilities = opts.capabilities;
  }

  configured() {
    if (this.opts.id === "astra") return Boolean(this.opts.baseURL);
    return Boolean(this.opts.apiKey);
  }

  note() {
    if (this.opts.id === "astra" && !this.opts.baseURL) {
      return "Set ASTRA_BASE_URL to any OpenAI-compatible endpoint (e.g. http://localhost:11434/v1 for Ollama).";
    }
    return undefined;
  }

  private sdk(): OpenAI {
    if (!this.configured()) {
      const what = this.opts.id === "astra" ? "ASTRA_BASE_URL" : "OPENAI_API_KEY";
      throw new ProviderError("not_configured", `${what} is not set.`, 400);
    }
    this.client ??= new OpenAI({
      // Local OpenAI-compatible servers often ignore auth, but the SDK requires a string.
      apiKey: this.opts.apiKey ?? (this.opts.requiresKey ? undefined : "not-needed"),
      baseURL: this.opts.baseURL,
      organization: this.opts.organization,
      defaultHeaders: this.opts.headers,
      maxRetries: 2,
    });
    return this.client;
  }

  fallbackModels() {
    return this.opts.models
      ? { models: modelsFrom(this.opts.models), source: "env" as const }
      : { models: modelsFrom(this.opts.defaults), source: "default" as const };
  }

  defaultModel() {
    return this.opts.defaultModel ?? this.opts.models?.[0] ?? this.opts.defaults[0];
  }

  async fetchModels(): Promise<ModelInfo[]> {
    const items: { id: string; created?: number }[] = [];
    for await (const m of this.sdk().models.list()) items.push({ id: m.id, created: m.created });
    const filtered = this.opts.id === "openai" ? items.filter((m) => isOpenAIChatModel(m.id)) : items;
    filtered.sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id));
    return filtered.map((m) => ({ id: m.id, label: m.id }));
  }

  private tokenLimit(maxTokens?: number) {
    return maxTokens ? { [this.opts.tokenParam]: maxTokens } : {};
  }

  async *stream(input: ChatInput): AsyncGenerator<StreamEvent> {
    const stream = await this.sdk().chat.completions.create(
      {
        model: input.model,
        messages: toOpenAIMessages(input.system, normalizeHistory(input.messages), this.capabilities, this.label),
        stream: true,
        stream_options: { include_usage: true },
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...this.tokenLimit(input.maxTokens),
      },
      { signal: input.signal },
    );
    let finish: string | undefined;
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) yield { type: "text", delta };
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) {
        yield { type: "usage", usage: { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens } };
      }
    }
    if (finish === "length") yield { type: "text", delta: "\n\n_[Output truncated: max tokens reached.]_" };
    if (finish === "content_filter") yield { type: "text", delta: "\n\n_[Response stopped by the provider's content filter.]_" };
    yield { type: "done", stopReason: finish };
  }

  startAgent(input: AgentInput): AgentSession {
    if (!this.capabilities.tools) {
      throw new ProviderError("bad_request", `${this.label} is not configured for tool calling (set ASTRA_SUPPORTS_TOOLS=true if it supports it).`, 400);
    }
    const tools: ChatCompletionTool[] = input.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    const messages = toOpenAIMessages(input.system, normalizeHistory(input.messages), this.capabilities, this.label);
    const sdk = () => this.sdk();
    const tokenLimit = this.tokenLimit(input.maxTokens);

    return {
      async step(signal, onText) {
        const stream = await sdk().chat.completions.create(
          { model: input.model, messages, tools, stream: true, stream_options: { include_usage: true }, ...tokenLimit },
          { signal },
        );
        let text = "";
        let finish: string | undefined;
        let usage;
        const partial = new Map<number, { id: string; name: string; args: string }>();
        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          if (choice?.delta?.content) {
            text += choice.delta.content;
            onText(choice.delta.content);
          }
          for (const tc of choice?.delta?.tool_calls ?? []) {
            const cur = partial.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            partial.set(tc.index, cur);
          }
          if (choice?.finish_reason) finish = choice.finish_reason;
          if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
        }
        const calls = [...partial.entries()].sort(([a], [b]) => a - b).map(([, c], i) => ({ ...c, id: c.id || `call_${Date.now()}_${i}` }));
        messages.push({
          role: "assistant",
          content: text || null,
          ...(calls.length
            ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })) }
            : {}),
        });
        const toolCalls: ToolCall[] = calls.map((c) => {
          try {
            const parsed = JSON.parse(c.args || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { id: c.id, name: c.name, input: parsed };
            return { id: c.id, name: c.name, input: {}, parseError: "Arguments were not a JSON object." };
          } catch {
            return { id: c.id, name: c.name, input: {}, parseError: "Arguments were not valid JSON." };
          }
        });
        return { text, toolCalls: finish === "length" ? [] : toolCalls, stopReason: finish, usage };
      },
      addToolResults(results) {
        for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `ERROR: ${r.output}` : r.output });
      },
    };
  }
}
