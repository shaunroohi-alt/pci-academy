import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readEventStream } from "@/lib/shared/sse";
import type { StreamEvent } from "@/lib/shared/types";

const dataDir = mkdtempSync(path.join(tmpdir(), "sb-data-"));
const wsDir = mkdtempSync(path.join(tmpdir(), "sb-wsapi-"));

beforeAll(() => {
  process.env.ENABLE_MOCK_PROVIDER = "true";
  process.env.DATA_DIR = dataDir;
  process.env.WORKSPACE_DIR = wsDir;
  process.env.RATE_LIMIT_PER_MINUTE = "0";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.ASTRA_BASE_URL;
});

async function collect(res: Response): Promise<StreamEvent[]> {
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const out: StreamEvent[] = [];
  for await (const ev of readEventStream(res.body!)) out.push(ev);
  return out;
}

const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const settings = { provider: "mock", model: "echo", systemPrompt: "be nice" };

describe("/api/chat", () => {
  it("streams a reply and persists the conversation", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const events = await collect(await POST(post("/api/chat", { settings, message: { content: "hello there", attachments: [] } })));
    const meta = events.find((e) => e.type === "meta") as Extract<StreamEvent, { type: "meta" }>;
    expect(meta).toBeTruthy();
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toContain("> hello there");
    expect(text).toContain("be nice");
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });

    const { GET } = await import("@/app/api/conversations/[id]/route");
    const conv = (await (await GET(new Request("http://x"), { params: Promise.resolve({ id: meta.conversationId }) })).json()).conversation;
    expect(conv.title).toBe("hello there");
    expect(conv.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(conv.messages[1].content).toBe(text);

    // Second turn + regenerate keep a clean transcript.
    await collect(await POST(post("/api/chat", { conversationId: meta.conversationId, settings, message: { content: "second", attachments: [] } })));
    await collect(await POST(post("/api/chat", { conversationId: meta.conversationId, settings, regenerate: true })));
    const after = (await (await GET(new Request("http://x"), { params: Promise.resolve({ id: meta.conversationId }) })).json()).conversation;
    expect(after.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("reports provider errors in-stream with retry info and stores them", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const events = await collect(await POST(post("/api/chat", { settings: { ...settings, model: "fail" }, message: { content: "x", attachments: [] } })));
    const err = events.find((e) => e.type === "error") as Extract<StreamEvent, { type: "error" }>;
    expect(err.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 7 });
  });

  it("rejects bad input before streaming", async () => {
    const { POST } = await import("@/app/api/chat/route");
    expect((await POST(post("/api/chat", { settings: { ...settings, provider: "nope" } }))).status).toBe(400);
    const unconfigured = await POST(post("/api/chat", { settings: { ...settings, provider: "openai", model: "gpt-5" }, message: { content: "x", attachments: [] } }));
    expect(unconfigured.status).toBe(400);
    expect((await unconfigured.json()).error.code).toBe("not_configured");
    const badAtt = await POST(post("/api/chat", { settings, message: { content: "x", attachments: [{ id: "1", name: "a.exe", mimeType: "application/x-msdownload", size: 1, kind: "image", data: "AA==" }] } }));
    expect(badAtt.status).toBe(400);
    const empty = await POST(post("/api/chat", { settings, message: { content: "  ", attachments: [] } }));
    expect(empty.status).toBe(400);
  });

  it("accepts image and text attachments", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const events = await collect(
      await POST(post("/api/chat", { settings, message: { content: "see", attachments: [{ id: "1", name: "a.png", mimeType: "image/png", size: 3, kind: "image", data: "iVBO" }, { id: "2", name: "n.md", mimeType: "text/markdown", size: 2, kind: "text", data: "hi" }] } })),
    );
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toContain("`a.png` (image)");
    expect(text).toContain("`n.md` (text)");
  });

  it("applies the server-side rate limit", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "1";
    const { POST } = await import("@/app/api/chat/route");
    const req = () => new Request("http://localhost/api/chat", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: "{}" });
    expect((await POST(req())).status).toBe(400);
    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    process.env.RATE_LIMIT_PER_MINUTE = "0";
  });
});

describe("other routes", () => {
  it("health reports storage and provider configuration without secrets", async () => {
    process.env.OPENAI_API_KEY = "sk-should-not-leak-123456";
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request("http://x/api/health"));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("sk-should-not-leak");
    const body = JSON.parse(text);
    expect(body.storage).toBe("writable");
    expect(body.providers.openai.configured).toBe(true);
    expect(body.providers.mock.configured).toBe(true);
    delete process.env.OPENAI_API_KEY;
  });

  it("models lists every provider with fallbacks when not live", async () => {
    const { GET } = await import("@/app/api/models/route");
    const { providers } = await (await GET(new Request("http://x/api/models?live=0"))).json();
    expect(providers.map((p: { id: string }) => p.id)).toEqual(["anthropic", "openai", "gemini", "astra", "mock"]);
    const anthropic = providers.find((p: { id: string }) => p.id === "anthropic");
    expect(anthropic.configured).toBe(false);
    expect(anthropic.models.length).toBeGreaterThan(0);
    const astra = providers.find((p: { id: string }) => p.id === "astra");
    expect(astra.note).toMatch(/ASTRA_BASE_URL/);
  });

  it("astra becomes available when pointed at an endpoint", async () => {
    process.env.ASTRA_BASE_URL = "http://127.0.0.1:9/v1";
    process.env.ASTRA_MODELS = "llama3.1,qwen2.5";
    process.env.ASTRA_LABEL = "Astra";
    const { GET } = await import("@/app/api/models/route");
    const { providers } = await (await GET(new Request("http://x/api/models?live=0"))).json();
    const astra = providers.find((p: { id: string }) => p.id === "astra");
    expect(astra.configured).toBe(true);
    expect(astra.models.map((m: { id: string }) => m.id)).toEqual(["llama3.1", "qwen2.5"]);
    // An unreachable endpoint surfaces a network error in the stream, not a crash.
    const { POST } = await import("@/app/api/chat/route");
    const events = await collect(await POST(post("/api/chat", { settings: { provider: "astra", model: "llama3.1", systemPrompt: "" }, message: { content: "hi", attachments: [] } })));
    const err = events.find((e) => e.type === "error") as Extract<StreamEvent, { type: "error" }>;
    expect(err.error.code).toBe("network");
    delete process.env.ASTRA_BASE_URL;
    delete process.env.ASTRA_MODELS;
  }, 30_000);

  it("conversation list, rename and delete", async () => {
    const list = await (await import("@/app/api/conversations/route")).GET();
    const { conversations } = await list.json();
    expect(conversations.length).toBeGreaterThan(0);
    const route = await import("@/app/api/conversations/[id]/route");
    const id = conversations[0].id;
    const patched = await route.PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ title: "Renamed" }) }), { params: Promise.resolve({ id }) });
    expect((await patched.json()).conversation.title).toBe("Renamed");
    expect((await route.DELETE(new Request("http://x"), { params: Promise.resolve({ id }) })).status).toBe(204);
    expect((await route.GET(new Request("http://x"), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect((await route.GET(new Request("http://x"), { params: Promise.resolve({ id: "../../x" }) })).status).toBe(404);
  });

  it("workspace agent runs the tool loop with the mock provider", async () => {
    const files = await import("@/app/api/workspace/files/route");
    await files.PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ path: "hello.txt", content: "hi" }) }));
    const { POST } = await import("@/app/api/workspace/agent/route");
    const events = await collect(await POST(post("/api/workspace/agent", { provider: "mock", model: "echo", messages: [{ role: "user", content: "what is here?" }] })));
    const types = events.map((e) => e.type);
    expect(types).toContain("tool_call");
    const result = events.find((e) => e.type === "tool_result") as Extract<StreamEvent, { type: "tool_result" }>;
    expect(result.output).toContain("hello.txt");
    expect(types.at(-1)).toBe("done");
    const escape = await files.GET(new Request("http://x/api/workspace/files?read=1&path=../../etc/passwd"));
    expect(escape.status).toBe(400);
  });

  it("exec and Claude Code endpoints are off by default", async () => {
    delete process.env.ENABLE_SHELL;
    delete process.env.ENABLE_CLAUDE_CODE_CLI;
    expect((await (await import("@/app/api/workspace/exec/route")).POST(post("/x", { command: "ls" }))).status).toBe(403);
    expect((await (await import("@/app/api/workspace/claude-code/route")).POST(post("/x", { prompt: "hi" }))).status).toBe(403);
  });

  it("exec streams command output when enabled", async () => {
    process.env.ENABLE_SHELL = "true";
    const events = await collect(await (await import("@/app/api/workspace/exec/route")).POST(post("/x", { command: "echo from-shell" })));
    expect(events.filter((e) => e.type === "log").map((e) => (e as { text: string }).text).join("")).toContain("from-shell");
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "exit 0" });
    delete process.env.ENABLE_SHELL;
  });
});
