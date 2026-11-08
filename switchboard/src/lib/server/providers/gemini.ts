import "server-only";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { ServerConfig } from "@/lib/server/config";
import { ProviderError } from "@/lib/server/errors";
import type { StreamEvent, Usage } from "@/lib/shared/types";
import { normalizeHistory, textFileBlock, type Turn } from "./history";
import type { AgentInput, AgentSession, ChatInput, ChatProvider, ToolCall } from "./types";
import { modelsFrom } from "./types";

export const GEMINI_DEFAULT_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

export function toGeminiContents(turns: Turn[]): Content[] {
  return turns.map((t) => {
    const parts: Part[] = [];
    for (const a of t.attachments) {
      if (a.kind === "text") parts.push({ text: textFileBlock(a) });
      else parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    }
    if (t.text.trim()) parts.push({ text: t.text });
    return { role: t.role === "assistant" ? "model" : "user", parts };
  });
}

function visibleText(parts: Part[] | undefined): string {
  return (parts ?? []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
}

function usageOf(meta: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined): Usage | undefined {
  return meta ? { inputTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount } : undefined;
}

export class GeminiProvider implements ChatProvider {
  id = "gemini" as const;
  label = "Google Gemini";
  capabilities = { images: true, pdf: true, tools: true };
  private client: GoogleGenAI | null = null;

  constructor(private cfg: ServerConfig["gemini"]) {}

  configured() {
    return Boolean(this.cfg.apiKey);
  }

  private sdk(): GoogleGenAI {
    if (!this.cfg.apiKey) throw new ProviderError("not_configured", "GEMINI_API_KEY is not set.", 400);
    this.client ??= new GoogleGenAI({ apiKey: this.cfg.apiKey, ...(this.cfg.baseURL ? { httpOptions: { baseUrl: this.cfg.baseURL } } : {}) });
    return this.client;
  }

  fallbackModels() {
    return this.cfg.models
      ? { models: modelsFrom(this.cfg.models), source: "env" as const }
      : { models: modelsFrom(GEMINI_DEFAULT_MODELS), source: "default" as const };
  }

  defaultModel() {
    return this.cfg.defaultModel ?? this.cfg.models?.[0] ?? GEMINI_DEFAULT_MODELS[0];
  }

  async fetchModels() {
    const out = [];
    const pager = await this.sdk().models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      const id = (m.name ?? "").replace(/^models\//, "");
      if (!id.startsWith("gemini")) continue;
      if (m.supportedActions && !m.supportedActions.includes("generateContent")) continue;
      if (/(embedding|tts|image|live|audio)/.test(id)) continue;
      out.push({ id, label: m.displayName || id });
    }
    return out;
  }

  async *stream(input: ChatInput): AsyncGenerator<StreamEvent> {
    const stream = await this.sdk().models.generateContentStream({
      model: input.model,
      contents: toGeminiContents(normalizeHistory(input.messages)),
      config: {
        abortSignal: input.signal,
        ...(input.system ? { systemInstruction: input.system } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
      },
    });
    let usage: Usage | undefined;
    let finish: string | undefined;
    for await (const chunk of stream) {
      const cand = chunk.candidates?.[0];
      const text = visibleText(cand?.content?.parts);
      if (text) yield { type: "text", delta: text };
      if (cand?.finishReason) finish = String(cand.finishReason);
      usage = usageOf(chunk.usageMetadata) ?? usage;
      if (chunk.promptFeedback?.blockReason) {
        throw new ProviderError("bad_request", `Gemini blocked the prompt: ${chunk.promptFeedback.blockReason}`, 400);
      }
    }
    if (usage) yield { type: "usage", usage };
    if (finish === "MAX_TOKENS") yield { type: "text", delta: "\n\n_[Output truncated: max tokens reached.]_" };
    if (finish === "SAFETY") yield { type: "text", delta: "\n\n_[Response stopped by Gemini safety filters.]_" };
    yield { type: "done", stopReason: finish };
  }

  startAgent(input: AgentInput): AgentSession {
    const contents = toGeminiContents(normalizeHistory(input.messages));
    const tools = [
      { functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) },
    ];
    const sdk = () => this.sdk();
    let counter = 0;

    return {
      async step(signal, onText) {
        const stream = await sdk().models.generateContentStream({
          model: input.model,
          contents,
          config: {
            abortSignal: signal,
            systemInstruction: input.system,
            tools,
            ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
          },
        });
        // Keep every part (including thought signatures) so the model turn is replayed intact.
        const parts: Part[] = [];
        let finish: string | undefined;
        let usage: Usage | undefined;
        for await (const chunk of stream) {
          const cand = chunk.candidates?.[0];
          for (const p of cand?.content?.parts ?? []) {
            parts.push(p);
            if (typeof p.text === "string" && !p.thought && p.text) onText(p.text);
          }
          if (cand?.finishReason) finish = String(cand.finishReason);
          usage = usageOf(chunk.usageMetadata) ?? usage;
        }
        contents.push({ role: "model", parts });
        const toolCalls: ToolCall[] = parts
          .filter((p) => p.functionCall)
          .map((p) => ({
            id: p.functionCall!.id ?? `fc_${++counter}`,
            name: p.functionCall!.name ?? "",
            input: (p.functionCall!.args ?? {}) as Record<string, unknown>,
          }));
        return { text: visibleText(parts), toolCalls, stopReason: finish, usage };
      },
      addToolResults(results) {
        contents.push({
          role: "user",
          parts: results.map((r) => ({
            functionResponse: {
              id: r.id.startsWith("fc_") ? undefined : r.id,
              name: r.name,
              response: r.isError ? { error: r.output } : { output: r.output },
            },
          })),
        });
      },
    };
  }
}
