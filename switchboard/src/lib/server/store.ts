import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Conversation, ConversationSummary } from "@/lib/shared/types";

/**
 * File-backed conversation store: one JSON document per conversation under
 * DATA_DIR/conversations. Writes are atomic (temp file + rename) and
 * serialised per conversation, so a crash never leaves a half-written file.
 * No native dependencies, trivially backed up, easy to mount as a volume.
 */
export class ConversationStore {
  private locks = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  private get convDir() {
    return path.join(this.dir, "conversations");
  }

  private file(id: string) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid conversation id");
    return path.join(this.convDir, `${id}.json`);
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.convDir, { recursive: true });
  }

  /** Verify the data directory is writable (used by the health check). */
  async probe(): Promise<boolean> {
    try {
      await this.ensure();
      const p = path.join(this.dir, `.probe-${process.pid}`);
      await fs.writeFile(p, "ok");
      await fs.rm(p, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }

  async get(id: string): Promise<Conversation | null> {
    try {
      return JSON.parse(await fs.readFile(this.file(id), "utf8")) as Conversation;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  private async write(conv: Conversation): Promise<void> {
    await this.ensure();
    const target = this.file(conv.id);
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(conv), "utf8");
    await fs.rename(tmp, target);
  }

  async save(conv: Conversation): Promise<Conversation> {
    return this.withLock(conv.id, async () => {
      await this.write(conv);
      return conv;
    });
  }

  /** Read-modify-write under the conversation's lock. */
  async update(id: string, fn: (c: Conversation) => Conversation | void): Promise<Conversation | null> {
    return this.withLock(id, async () => {
      const conv = await this.get(id);
      if (!conv) return null;
      const next = fn(conv) ?? conv;
      next.updatedAt = new Date().toISOString();
      await this.write(next);
      return next;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.withLock(id, async () => {
      try {
        await fs.rm(this.file(id));
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw e;
      }
    });
  }

  async list(): Promise<ConversationSummary[]> {
    await this.ensure();
    const names = (await fs.readdir(this.convDir)).filter((n) => n.endsWith(".json"));
    const out: ConversationSummary[] = [];
    await Promise.all(
      names.map(async (n) => {
        try {
          const c = JSON.parse(await fs.readFile(path.join(this.convDir, n), "utf8")) as Conversation;
          out.push({
            id: c.id,
            title: c.title,
            provider: c.provider,
            model: c.model,
            updatedAt: c.updatedAt,
            messageCount: c.messages.length,
          });
        } catch {
          // Skip unreadable/corrupt files instead of failing the whole list.
        }
      }),
    );
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

let store: ConversationStore | null = null;

export function getStore(dataDir: string): ConversationStore {
  if (!store || (store as unknown as { dir: string }).dir !== dataDir) store = new ConversationStore(dataDir);
  return store;
}

export function newId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 20);
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New conversation";
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}
