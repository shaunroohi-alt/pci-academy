"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, describeError, streamRequest, type ChatSendBody } from "@/lib/client/api";
import type { Attachment, ChatSettings, Message, ProviderStatus, PublicConfig } from "@/lib/shared/types";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";

const SUGGESTIONS = [
  "Explain the difference between TCP and UDP with a table",
  "Write a TypeScript function that debounces another function, with tests",
  "Summarise the attached PDF in five bullet points",
  "Draft a polite email declining a meeting",
];

export function ChatView({
  conversationId,
  initialMessages,
  settings,
  providers,
  config,
  onConversationCreated,
  onActivity,
}: {
  conversationId: string | null;
  initialMessages: Message[];
  settings: ChatSettings;
  providers: ProviderStatus[];
  config: PublicConfig;
  onConversationCreated: (id: string) => void;
  onActivity: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convRef = useRef<string | null>(conversationId);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const provider = providers.find((p) => p.id === settings.provider);
  const disabledReason = !provider
    ? "Pick a provider to start."
    : !provider.configured
      ? `${provider.label} is not configured — add credentials in .env (see README).`
      : !settings.model
        ? "Pick a model."
        : undefined;

  const run = useCallback(
    async (body: ChatSendBody, optimistic: Message[]) => {
      const placeholderId = `pending-${Date.now()}`;
      const assistant: Message = { id: placeholderId, role: "assistant", content: "", provider: settings.provider, model: settings.model, createdAt: new Date().toISOString() };
      setMessages([...optimistic, assistant]);
      setStreamingId(placeholderId);
      setBanner(null);
      stick.current = true;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let currentId = placeholderId;
      // Capture the target id now: updaters run later, after currentId may have changed.
      const patch = (fn: (m: Message) => Message) => {
        const target = currentId;
        setMessages((prev) => prev.map((m) => (m.id === target ? fn(m) : m)));
      };
      try {
        await streamRequest(
          "/api/chat",
          body,
          (ev) => {
            switch (ev.type) {
              case "meta": {
                const newId = ev.assistantMessageId;
                patch((m) => ({ ...m, id: newId }));
                currentId = newId;
                setStreamingId(newId);
                if (convRef.current !== ev.conversationId) {
                  convRef.current = ev.conversationId;
                  onConversationCreated(ev.conversationId);
                }
                break;
              }
              case "text":
                patch((m) => ({ ...m, content: m.content + ev.delta }));
                break;
              case "usage":
                patch((m) => ({ ...m, usage: ev.usage }));
                break;
              case "error":
                patch((m) => ({ ...m, error: describeError(ev.error) }));
                break;
            }
          },
          ctrl.signal,
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") patch((m) => ({ ...m, stopped: true }));
        else if (e instanceof ApiError) {
          // Request rejected before streaming: nothing was stored server-side for the assistant.
          patch((m) => ({ ...m, error: describeError(e.error) }));
        } else patch((m) => ({ ...m, error: (e as Error).message || "Network error" }));
      } finally {
        setStreamingId(null);
        abortRef.current = null;
        onActivity();
      }
    },
    [settings.provider, settings.model, onConversationCreated, onActivity],
  );

  function send(text: string, attachments: Attachment[]) {
    const userMsg: Message = { id: `local-${Date.now()}`, role: "user", content: text, attachments: attachments.length ? attachments : undefined, createdAt: new Date().toISOString() };
    run({ conversationId: convRef.current ?? undefined, settings, message: { content: text, attachments } }, [...messages, userMsg]);
  }

  function regenerate() {
    if (!convRef.current) return;
    const trimmed = [...messages];
    while (trimmed.length && trimmed[trimmed.length - 1].role === "assistant") trimmed.pop();
    if (!trimmed.length) return;
    run({ conversationId: convRef.current, settings, regenerate: true }, trimmed);
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 ? (
          <div className="empty">
            <div className="empty-logo">⌁</div>
            <h1>{config.appName}</h1>
            <p className="muted">One console for Claude, Gemini, OpenAI and {config.astraLabel}. Keys stay on the server.</p>
            <div className="provider-grid">
              {providers.map((p) => (
                <div key={p.id} className={`provider-card ${p.configured ? "" : "off"}`}>
                  <span className={`dot p-${p.id}`} />
                  <div>
                    <strong>{p.label}</strong>
                    <small title={p.note}>{p.configured ? `${p.models.length} model${p.models.length === 1 ? "" : "s"} · ${p.modelSource === "api" ? "live list" : p.modelSource}` : p.id === "astra" ? "Set ASTRA_BASE_URL" : "Add API key in .env"}</small>
                  </div>
                </div>
              ))}
            </div>
            {!disabledReason && (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s, [])}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="messages">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                providers={providers}
                streaming={m.id === streamingId}
                canRegenerate={!streamingId && m === lastAssistant && messages[messages.length - 1] === m && Boolean(convRef.current)}
                onRegenerate={regenerate}
              />
            ))}
          </div>
        )}
      </div>
      {banner && <div className="banner">{banner}</div>}
      <div className="composer-wrap">
        <Composer
          busy={Boolean(streamingId)}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          maxAttachmentBytes={config.maxAttachmentBytes}
          capabilities={provider?.capabilities}
          disabledReason={disabledReason}
        />
      </div>
    </div>
  );
}
