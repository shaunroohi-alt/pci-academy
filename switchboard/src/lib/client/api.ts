"use client";

import { readEventStream } from "@/lib/shared/sse";
import type {
  AppError,
  ChatSettings,
  Conversation,
  ConversationSummary,
  ProviderStatus,
  PublicConfig,
  StreamEvent,
  Attachment,
  WorkspaceEntry,
} from "@/lib/shared/types";

export class ApiError extends Error {
  constructor(public error: AppError) {
    super(error.message);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body?.error) return new ApiError(body.error as AppError);
  } catch {
    /* not JSON */
  }
  const retry = res.headers.get("retry-after");
  return new ApiError({ code: res.status === 429 ? "rate_limited" : "unknown", status: res.status, message: `${res.status} ${res.statusText}`, retryAfterSeconds: retry ? Number(retry) : undefined });
}

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export const api = {
  config: () => json<PublicConfig>("/api/config"),
  models: (live = true) => json<{ providers: ProviderStatus[] }>(`/api/models${live ? "" : "?live=0"}`).then((r) => r.providers),
  health: (deep = false) => json<{ status: string; storage: string; providers: Record<string, { configured: boolean; reachable?: boolean; error?: string }> }>(`/api/health${deep ? "?deep=1" : ""}`),
  conversations: () => json<{ conversations: ConversationSummary[] }>("/api/conversations").then((r) => r.conversations),
  conversation: (id: string) => json<{ conversation: Conversation }>(`/api/conversations/${id}`).then((r) => r.conversation),
  patchConversation: (id: string, patch: Partial<ChatSettings> & { title?: string }) =>
    json<{ conversation: Conversation }>(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.conversation),
  deleteConversation: async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw await parseError(res);
  },
  files: () => json<{ entries: WorkspaceEntry[] }>("/api/workspace/files").then((r) => r.entries),
  readFile: (path: string) => json<{ content: string }>(`/api/workspace/files?read=1&path=${encodeURIComponent(path)}`).then((r) => r.content),
  writeFile: (path: string, content: string) => json<{ ok: true }>("/api/workspace/files", { method: "PUT", body: JSON.stringify({ path, content }) }),
};

/** POST and consume a Server-Sent Events response. */
export async function streamRequest(url: string, body: unknown, onEvent: (ev: StreamEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw await parseError(res);
  for await (const ev of readEventStream(res.body)) onEvent(ev);
}

export interface ChatSendBody {
  conversationId?: string;
  settings: ChatSettings;
  message?: { content: string; attachments: Attachment[] };
  regenerate?: boolean;
}

export function describeError(e: AppError): string {
  const retry = e.retryAfterSeconds ? ` Retry in ~${e.retryAfterSeconds}s.` : "";
  return `${e.message}${retry}`;
}
