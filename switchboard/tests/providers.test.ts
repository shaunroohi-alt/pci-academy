import { describe, expect, it } from "vitest";
import { anthropicAcceptsTemperature, anthropicUsesFallbacks, toAnthropicMessages } from "@/lib/server/providers/anthropic";
import { toGeminiContents } from "@/lib/server/providers/gemini";
import { normalizeHistory } from "@/lib/server/providers/history";
import { isOpenAIChatModel, toOpenAIMessages } from "@/lib/server/providers/openai-compatible";
import type { Attachment, Message } from "@/lib/shared/types";

const img: Attachment = { id: "i", name: "a.png", mimeType: "image/png", size: 3, kind: "image", data: "AAAA" };
const pdf: Attachment = { id: "p", name: "doc.pdf", mimeType: "application/pdf", size: 3, kind: "pdf", data: "BBBB" };
const txt: Attachment = { id: "t", name: "notes.md", mimeType: "text/markdown", size: 5, kind: "text", data: "# hi" };

const m = (role: Message["role"], content: string, extra: Partial<Message> = {}): Message => ({ id: Math.random().toString(), role, content, createdAt: "", ...extra });

describe("normalizeHistory", () => {
  it("drops failed assistant turns and merges consecutive user turns", () => {
    const turns = normalizeHistory([m("user", "one"), m("assistant", "", { error: "boom" }), m("user", "two", { attachments: [img] }), m("assistant", "ok")]);
    expect(turns).toEqual([
      { role: "user", text: "one\n\ntwo", attachments: [img] },
      { role: "assistant", text: "ok", attachments: [] },
    ]);
  });

  it("never starts with an assistant turn", () => {
    expect(normalizeHistory([m("assistant", "hi"), m("user", "q")])[0].role).toBe("user");
  });
});

describe("provider message formatting", () => {
  const turns = normalizeHistory([m("user", "look", { attachments: [img, pdf, txt] }), m("assistant", "seen"), m("user", "again")]);

  it("Anthropic: image, document and text blocks before the prompt", () => {
    const msgs = toAnthropicMessages(turns);
    const first = msgs[0].content as Array<{ type: string }>;
    expect(first.map((b) => b.type)).toEqual(["image", "document", "text", "text"]);
    expect(msgs[1]).toEqual({ role: "assistant", content: "seen" });
  });

  it("OpenAI: system first, image_url + file parts", () => {
    const msgs = toOpenAIMessages("be brief", turns, { images: true, pdf: true, tools: true }, "OpenAI");
    expect(msgs[0]).toEqual({ role: "system", content: "be brief" });
    const parts = msgs[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.map((p) => p.type)).toEqual(["image_url", "file", "text", "text"]);
    expect(parts[0].image_url?.url).toBe("data:image/png;base64,AAAA");
    expect(msgs[3]).toEqual({ role: "user", content: "again" });
  });

  it("OpenAI-compatible without vision: unsupported files become notes", () => {
    const msgs = toOpenAIMessages(undefined, turns, { images: false, pdf: false, tools: false }, "Astra");
    const parts = msgs[0].content as Array<{ type: string; text?: string }>;
    expect(parts.every((p) => p.type === "text")).toBe(true);
    expect(parts[0].text).toContain("Astra does not accept");
  });

  it("Gemini: model role and inline data", () => {
    const contents = toGeminiContents(turns);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[0].parts?.[0]).toEqual({ inlineData: { mimeType: "image/png", data: "AAAA" } });
  });
});

describe("model rules", () => {
  it("only forwards temperature to Claude models that accept it", () => {
    expect(anthropicAcceptsTemperature("claude-opus-5")).toBe(false);
    expect(anthropicAcceptsTemperature("claude-sonnet-5")).toBe(false);
    expect(anthropicAcceptsTemperature("claude-fable-5-1")).toBe(false);
    expect(anthropicAcceptsTemperature("claude-haiku-4-5")).toBe(true);
    expect(anthropicAcceptsTemperature("claude-sonnet-4-6")).toBe(true);
  });

  it("enables refusal fallbacks only where documented", () => {
    expect(anthropicUsesFallbacks("claude-opus-5")).toBe(true);
    expect(anthropicUsesFallbacks("claude-fable-5-1")).toBe(true);
    expect(anthropicUsesFallbacks("claude-opus-5-5")).toBe(false);
    expect(anthropicUsesFallbacks("claude-haiku-4-5")).toBe(false);
  });

  it("filters OpenAI's model list to chat models", () => {
    expect(["gpt-5", "gpt-4o", "o4-mini", "chatgpt-4o-latest"].every(isOpenAIChatModel)).toBe(true);
    expect(["text-embedding-3-large", "gpt-4o-realtime-preview", "tts-1", "dall-e-3", "gpt-image-1", "whisper-1"].some(isOpenAIChatModel)).toBe(false);
  });
});
