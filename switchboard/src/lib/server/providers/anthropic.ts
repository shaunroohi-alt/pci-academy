import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ServerConfig } from "@/lib/server/config";
import { ProviderError } from "@/lib/server/errors";
import type { StreamEvent } from "@/lib/shared/types";
import { normalizeHistory, textFileBlock, type Turn } from "./history";
import type { AgentInput, AgentSession, ChatInput, ChatProvider, ToolCall } from "./types";
import { modelsFrom } from "./types";

import type * as Beta from "@anthropic-ai/sdk/resources/beta/messages/messages";

export const ANTHROPIC_DEFAULT_MODELS = [
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
];

const DEFAULT_MAX_TOKENS = 32_000;

/**
 * Current Claude models (Fable 5.x, Mythos, Opus 5.x, Sonnet 5, Opus 4.7/4.8)
 * reject sampling parameters with a 400, so temperature is only forwarded to
 * models that still accept it (Haiku 4.5, the 4.6 family and older).
 */
export function anthropicAcceptsTemperature(model: string): boolean {
  return !/claude-(fable|mythos|opus-5|sonnet-5|opus-4-7|opus-4-8)/.test(model);
}

/** Models where server-side refusal fallbacks are enabled by default. */
export function anthropicUsesFallbacks(model: string): boolean {
  return /^claude-(fable-5-1|opus-5)$/.test(model);
}

export function toAnthropicContent(turn: Turn): Beta.BetaContentBlockParam[] {
  const blocks: Beta.BetaContentBlockParam[] = [];
  for (const a of turn.attachments) {
    if (a.kind === "image") {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: a.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: a.data,
        },
      });
    } else if (a.kind === "pdf") {
      blocks.push({
        type: "document",
        title: a.name,
        source: { type: "base64", media_type: "application/pdf", data: a.data },
      });
    } else {
      blocks.push({ type: "text", text: textFileBlock(a) });
    }
  }
  if (turn.text.trim()) blocks.push({ type: "text", text: turn.text });
  return blocks;
}

export function toAnthropicMessages(turns: Turn[]): Beta.BetaMessageParam[] {
  return turns.map((t) =>
    t.role === "assistant"
      ? { role: "assistant", content: t.text }
      : { role: "user", content: toAnthropicContent(t) },
  );
}

export class AnthropicProvider implements ChatProvider {
  id = "anthropic" as const;
  label = "Anthropic Claude";
  capabilities = { images: true, pdf: true, tools: true };
  private client: Anthropic | null = null;

  constructor(private cfg: ServerConfig["anthropic"], private fallbacksEnabled = true) {}

  configured() {
    return Boolean(this.cfg.apiKey);
  }

  private sdk(): Anthropic {
    if (!this.cfg.apiKey) throw new ProviderError("not_configured", "ANTHROPIC_API_KEY is not set.", 400);
    this.client ??= new Anthropic({ apiKey: this.cfg.apiKey, baseURL: this.cfg.baseURL, maxRetries: 2 });
    return this.client;
  }

  fallbackModels() {
    return this.cfg.models
      ? { models: modelsFrom(this.cfg.models), source: "env" as const }
      : { models: modelsFrom(ANTHROPIC_DEFAULT_MODELS), source: "default" as const };
  }

  defaultModel() {
    return this.cfg.defaultModel ?? this.cfg.models?.[0] ?? ANTHROPIC_DEFAULT_MODELS[0];
  }

  async fetchModels() {
    const out = [];
    for await (const m of this.sdk().models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name || m.id });
    return out;
  }

  private params(model: string, maxTokens: number | undefined) {
    const useFallbacks = this.fallbacksEnabled && anthropicUsesFallbacks(model);
    return {
      model,
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    };
  }

  async *stream(input: ChatInput): AsyncGenerator<StreamEvent> {
    const stream = this.sdk().beta.messages.stream(
      {
        ...this.params(input.model, input.maxTokens),
        ...(input.system ? { system: input.system } : {}),
        ...(input.temperature !== undefined && anthropicAcceptsTemperature(input.model)
          ? { temperature: input.temperature }
          : {}),
        messages: toAnthropicMessages(normalizeHistory(input.messages)),
      },
      { signal: input.signal },
    );
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        yield { type: "text", delta: ev.delta.text };
      }
    }
    const final = await stream.finalMessage();
    yield { type: "usage", usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens } };
    if (final.stop_reason === "refusal") {
      yield { type: "text", delta: "\n\n_The model declined to answer this request._" };
    } else if (final.stop_reason === "max_tokens") {
      yield { type: "text", delta: "\n\n_[Output truncated: max tokens reached.]_" };
    }
    yield { type: "done", stopReason: final.stop_reason ?? undefined };
  }

  startAgent(input: AgentInput): AgentSession {
    const tools: Beta.BetaToolUnion[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    }));
    const messages = toAnthropicMessages(normalizeHistory(input.messages));
    const sdk = () => this.sdk();
    const params = this.params(input.model, input.maxTokens);

    return {
      async step(signal, onText) {
        const stream = sdk().beta.messages.stream(
          { ...params, system: input.system, tools, messages },
          { signal },
        );
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onText(ev.delta.text);
        }
        const final = await stream.finalMessage();
        // Replay the assistant turn unchanged (including thinking blocks): history stays append-only.
        messages.push({ role: "assistant", content: final.content as Beta.BetaContentBlockParam[] });
        const toolCalls: ToolCall[] = [];
        let text = "";
        for (const block of final.content) {
          if (block.type === "text") text += block.text;
          if (block.type === "tool_use") {
            const inputObj = block.input;
            const ok = inputObj !== null && typeof inputObj === "object" && !Array.isArray(inputObj);
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: ok ? (inputObj as Record<string, unknown>) : {},
              parseError: ok ? undefined : "Tool input was not a JSON object.",
            });
          }
        }
        return {
          text,
          // Never run tools from a truncated or refused turn.
          toolCalls: final.stop_reason === "tool_use" ? toolCalls : [],
          stopReason: final.stop_reason ?? undefined,
          usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
        };
      },
      addToolResults(results) {
        messages.push({
          role: "user",
          content: results.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.id,
            content: r.output,
            is_error: r.isError ?? false,
          })),
        });
      },
    };
  }
}
