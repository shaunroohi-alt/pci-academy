/**
 * Exercises the real provider SDK code paths (official OpenAI and Anthropic
 * SDKs: HTTP, streaming parsers, tool calls) against local fake servers that
 * speak each API's wire format. No network, no real keys.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnthropicProvider } from "@/lib/server/providers/anthropic";
import { OpenAICompatibleProvider } from "@/lib/server/providers/openai-compatible";
import { runAgent } from "@/lib/server/workspace/agent";
import { toAppError } from "@/lib/server/errors";
import type { Message, StreamEvent } from "@/lib/shared/types";

type Handler = (req: http.IncomingMessage, body: Record<string, unknown>, res: http.ServerResponse) => void;
const requests: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];

function startServer(handler: Handler): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: req.url ?? "", headers: req.headers, body });
      handler(req, body, res);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() })));
}

const sse = (res: http.ServerResponse, frames: string[]) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const f of frames) res.write(f);
  res.end();
};

// ---------- fake OpenAI-compatible server ----------
const openaiHandler: Handler = (req, body, res) => {
  if (req.url?.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "tiny-llm", object: "model", created: 1, owned_by: "me" }] }));
    return;
  }
  if ((body.messages as { content: string }[]).some((m) => m.content === "please 429")) {
    res.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
    res.end(JSON.stringify({ error: { message: "slow down", type: "rate_limit" } }));
    return;
  }
  const chunk = (delta: object, finish: string | null = null) => `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const msgs = body.messages as { role: string }[];
  if (body.tools && !msgs.some((m) => m.role === "tool")) {
    sse(res, [
      chunk({ role: "assistant", content: "Checking." }),
      chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "write_file", arguments: '{"path":"out.txt",' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"content":"from openai agent"}' } }] }),
      chunk({}, "tool_calls"),
      "data: [DONE]\n\n",
    ]);
    return;
  }
  sse(res, [
    chunk({ role: "assistant", content: "Hel" }),
    chunk({ content: "lo!" }),
    chunk({}, "stop"),
    `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: body.model, choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\n`,
    "data: [DONE]\n\n",
  ]);
};

// ---------- fake Anthropic Messages server ----------
const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const anthropicHandler: Handler = (req, body, res) => {
  if (req.url?.startsWith("/v1/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ type: "model", id: "claude-opus-5", display_name: "Claude Opus 5", created_at: "2026-01-01T00:00:00Z" }], has_more: false, first_id: "claude-opus-5", last_id: "claude-opus-5" }));
    return;
  }
  const msgs = body.messages as { role: string; content: unknown }[];
  const start = ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 11, output_tokens: 1 } } });
  const hasToolResult = msgs.some((m) => Array.isArray(m.content) && (m.content as { type: string }[]).some((b) => b.type === "tool_result"));
  if (body.tools && !hasToolResult) {
    sse(res, [
      start,
      ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }),
      ev("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig-abc" } }),
      ev("content_block_stop", { index: 0 }),
      ev("content_block_start", { index: 1, content_block: { type: "text", text: "" } }),
      ev("content_block_delta", { index: 1, delta: { type: "text_delta", text: "Reading." } }),
      ev("content_block_stop", { index: 1 }),
      ev("content_block_start", { index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "list_files", input: {} } }),
      ev("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: '{"path":' } }),
      ev("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: '"."}' } }),
      ev("content_block_stop", { index: 2 }),
      ev("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } }),
      ev("message_stop", {}),
    ]);
    return;
  }
  sse(res, [
    start,
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hi from " } }),
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Claude" } }),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }),
    ev("message_stop", {}),
  ]);
};

const user = (content: string): Message => ({ id: "u", role: "user", content, createdAt: "" });
async function drain(gen: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const textOf = (evs: StreamEvent[]) => evs.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");

let oai: { url: string; close: () => void };
let ant: { url: string; close: () => void };
beforeAll(async () => {
  oai = await startServer(openaiHandler);
  ant = await startServer(anthropicHandler);
});
afterAll(() => {
  oai.close();
  ant.close();
});

describe("OpenAI-compatible adapter (Astra / OpenAI) over HTTP", () => {
  const make = () =>
    new OpenAICompatibleProvider({
      id: "astra",
      label: "Astra",
      baseURL: `${oai.url}/v1`,
      apiKey: "astra-key",
      headers: { "x-team": "blue" },
      capabilities: { images: false, pdf: false, tools: true },
      tokenParam: "max_tokens",
      requiresKey: false,
      defaults: [],
    });

  it("streams text and usage, sends system prompt, headers and max_tokens", async () => {
    const evs = await drain(make().stream({ model: "tiny-llm", system: "sys", messages: [user("hi")], maxTokens: 50, signal: new AbortController().signal }));
    expect(textOf(evs)).toBe("Hello!");
    expect(evs).toContainEqual({ type: "usage", usage: { inputTokens: 5, outputTokens: 2 } });
    const last = requests.at(-1)!;
    expect(last.headers.authorization).toBe("Bearer astra-key");
    expect(last.headers["x-team"]).toBe("blue");
    expect(last.body.max_tokens).toBe(50);
    expect((last.body.messages as { role: string }[])[0]).toEqual({ role: "system", content: "sys" });
  });

  it("lists models from /models", async () => {
    expect(await make().fetchModels()).toEqual([{ id: "tiny-llm", label: "tiny-llm" }]);
  });

  it("surfaces 429 as rate_limited", async () => {
    const p = make();
    await expect(drain(p.stream({ model: "tiny-llm", messages: [user("please 429")], signal: new AbortController().signal }))).rejects.toSatisfy((e) => toAppError(e).code === "rate_limited");
  }, 20_000);

  it("runs a function-calling agent loop and writes a file", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sb-int-"));
    const events: StreamEvent[] = [];
    await runAgent({ provider: make(), model: "tiny-llm", messages: [user("write it")], maxSteps: 5, ctx: { root, shellEnabled: false, shellTimeoutMs: 1000 }, signal: new AbortController().signal, emit: (e) => events.push(e) });
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({ name: "write_file", input: { path: "out.txt", content: "from openai agent" } });
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ isError: false });
    const second = requests.at(-1)!.body.messages as { role: string; tool_call_id?: string }[];
    expect(second.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(textOf(events)).toContain("Hello!");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(path.join(root, "out.txt"), "utf8")).toBe("from openai agent");
  });
});

describe("Anthropic adapter over HTTP", () => {
  const make = () => new AnthropicProvider({ apiKey: "sk-ant-test", baseURL: ant.url });

  it("streams text, omits temperature for current models, sends fallbacks for Opus 5", async () => {
    const evs = await drain(make().stream({ model: "claude-opus-5", system: "sys", messages: [user("hi")], temperature: 0.2, signal: new AbortController().signal }));
    expect(textOf(evs)).toBe("Hi from Claude");
    expect(evs).toContainEqual({ type: "usage", usage: { inputTokens: 11, outputTokens: 3 } });
    const last = requests.at(-1)!;
    expect(last.headers["x-api-key"]).toBe("sk-ant-test");
    expect(last.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(last.body.fallbacks).toBe("default");
    expect(last.body.temperature).toBeUndefined();
    expect(last.body.system).toBe("sys");
    expect(last.body.max_tokens).toBe(32000);
  });

  it("forwards temperature to Haiku and skips fallbacks there", async () => {
    await drain(make().stream({ model: "claude-haiku-4-5", messages: [user("hi")], temperature: 0.2, signal: new AbortController().signal }));
    const last = requests.at(-1)!;
    expect(last.body.temperature).toBe(0.2);
    expect(last.body.fallbacks).toBeUndefined();
    expect(last.headers["anthropic-beta"]).toBeUndefined();
  });

  it("lists models", async () => {
    expect(await make().fetchModels()).toEqual([{ id: "claude-opus-5", label: "Claude Opus 5" }]);
  });

  it("runs the tool loop and replays thinking blocks unchanged", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sb-int-a-"));
    const events: StreamEvent[] = [];
    await runAgent({ provider: make(), model: "claude-sonnet-5", messages: [user("look")], maxSteps: 5, ctx: { root, shellEnabled: false, shellTimeoutMs: 1000 }, signal: new AbortController().signal, emit: (e) => events.push(e) });
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({ name: "list_files", input: { path: "." } });
    const second = requests.at(-1)!.body as { messages: { role: string; content: { type: string; signature?: string; tool_use_id?: string }[] }[]; tools: { eager_input_streaming?: boolean }[] };
    const assistant = second.messages[1];
    expect(assistant.content.map((b) => b.type)).toEqual(["thinking", "text", "tool_use"]);
    expect(assistant.content[0].signature).toBe("sig-abc");
    expect(second.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(second.tools.every((t) => t.eager_input_streaming === true)).toBe(true);
    expect(textOf(events)).toContain("Hi from Claude");
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });
  });
});

describe("Gemini adapter over HTTP", () => {
  let gem: { url: string; close: () => void };
  beforeAll(async () => {
    gem = await startServer((req, body, res) => {
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }] }));
        return;
      }
      const contents = body.contents as { role: string; parts: Record<string, unknown>[] }[];
      const data = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
      const hasFnResponse = contents.some((c) => c.parts.some((p) => p.functionResponse));
      if (body.tools && !hasFnResponse) {
        sse(res, [data({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "list_files", args: { path: "." } }, thoughtSignature: "gsig" }] }, finishReason: "STOP" }] })]);
        return;
      }
      sse(res, [
        data({ candidates: [{ content: { role: "model", parts: [{ text: "secret thoughts", thought: true }] } }] }),
        data({ candidates: [{ content: { role: "model", parts: [{ text: "Hello from " }] } }] }),
        data({ candidates: [{ content: { role: "model", parts: [{ text: "Gemini" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }),
      ]);
    });
  });
  afterAll(() => gem.close());

  const make = async () => new (await import("@/lib/server/providers/gemini")).GeminiProvider({ apiKey: "AIza-test", baseURL: gem.url });

  it("streams visible text only, with system instruction and usage", async () => {
    const evs = await drain((await make()).stream({ model: "gemini-2.5-flash", system: "sys", messages: [user("hi")], signal: new AbortController().signal }));
    expect(textOf(evs)).toBe("Hello from Gemini");
    expect(evs).toContainEqual({ type: "usage", usage: { inputTokens: 4, outputTokens: 2 } });
    const last = requests.at(-1)!;
    expect(last.url).toContain("gemini-2.5-flash:streamGenerateContent");
    expect(last.headers["x-goog-api-key"]).toBe("AIza-test");
    expect(JSON.stringify(last.body.systemInstruction)).toContain("sys");
  });

  it("lists only generateContent Gemini models", async () => {
    expect(await (await make()).fetchModels()).toEqual([{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }]);
  });

  it("runs the function-calling loop and replays thought signatures", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sb-int-g-"));
    const events: StreamEvent[] = [];
    await runAgent({ provider: await make(), model: "gemini-2.5-flash", messages: [user("look")], maxSteps: 5, ctx: { root, shellEnabled: false, shellTimeoutMs: 1000 }, signal: new AbortController().signal, emit: (e) => events.push(e) });
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({ name: "list_files" });
    const contents = requests.at(-1)!.body.contents as { role: string; parts: Record<string, unknown>[] }[];
    expect(contents[1].parts[0]).toMatchObject({ thoughtSignature: "gsig" });
    expect(contents[2].parts[0]).toMatchObject({ functionResponse: { name: "list_files" } });
    expect(textOf(events)).toBe("Hello from Gemini");
  });
});
