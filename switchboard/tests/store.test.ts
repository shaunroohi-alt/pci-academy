import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConversationStore, titleFrom } from "@/lib/server/store";
import type { Conversation } from "@/lib/shared/types";

function conv(id: string, updatedAt = new Date().toISOString()): Conversation {
  return { id, title: `t-${id}`, provider: "mock", model: "echo", systemPrompt: "", createdAt: updatedAt, updatedAt, messages: [] };
}

describe("ConversationStore", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sb-store-"));
  const store = new ConversationStore(dir);

  it("saves, reads, lists (newest first) and deletes", async () => {
    await store.save(conv("a", "2024-01-01T00:00:00.000Z"));
    await store.save(conv("b", "2025-01-01T00:00:00.000Z"));
    expect((await store.get("a"))?.title).toBe("t-a");
    expect((await store.list()).map((c) => c.id)).toEqual(["b", "a"]);
    expect(await store.delete("a")).toBe(true);
    expect(await store.delete("a")).toBe(false);
    expect(await store.get("a")).toBeNull();
    expect(await store.probe()).toBe(true);
  });

  it("serialises concurrent updates without losing writes", async () => {
    await store.save(conv("c"));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.update("c", (c) => {
          c.messages.push({ id: `m${i}`, role: "user", content: String(i), createdAt: "" });
        }),
      ),
    );
    expect((await store.get("c"))?.messages).toHaveLength(20);
  });

  it("rejects path-like ids", async () => {
    await expect(store.get("../etc/passwd")).rejects.toThrow(/Invalid conversation id/);
  });

  it("builds titles", () => {
    expect(titleFrom("  hello   world ")).toBe("hello world");
    expect(titleFrom("")).toBe("New conversation");
    expect(titleFrom("x".repeat(100))).toHaveLength(58);
  });
});
