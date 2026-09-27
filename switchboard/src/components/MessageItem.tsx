"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/client/files";
import type { Message, ProviderStatus } from "@/lib/shared/types";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { providerShort } from "./ModelPicker";

export function MessageItem({
  message,
  providers,
  streaming,
  canRegenerate,
  onRegenerate,
}: {
  message: Message;
  providers: ProviderStatus[];
  streaming?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const prov = providers.find((p) => p.id === message.provider);

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      {!isUser && (
        <div className="msg-meta">
          <span className={`dot p-${message.provider ?? "mock"}`} />
          <span className="msg-provider">{message.provider ? providerShort(prov, message.provider) : "Assistant"}</span>
          {message.model && <code className="msg-model">{message.model}</code>}
          {streaming && <span className="typing" aria-label="Generating"><i /><i /><i /></span>}
        </div>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <div className="msg-atts">
          {message.attachments.map((a) =>
            a.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.id} src={`data:${a.mimeType};base64,${a.data}`} alt={a.name} className="msg-img" />
            ) : (
              <span key={a.id} className="chip">
                <Icon name="file" size={14} />
                <span className="chip-name">{a.name}</span>
                <span className="chip-size">{formatBytes(a.size)}</span>
              </span>
            ),
          )}
        </div>
      )}
      <div className="msg-body">
        {isUser ? <div className="msg-plain">{message.content}</div> : message.content ? <Markdown text={message.content} /> : !message.error && streaming ? <div className="msg-wait">Thinking…</div> : null}
        {message.error && (
          <div className="msg-error" role="alert">
            <strong>Request failed.</strong> {message.error}
          </div>
        )}
        {message.stopped && <div className="msg-note">Stopped.</div>}
      </div>
      {!isUser && !streaming && (
        <div className="msg-actions">
          <button
            className="icon-btn small"
            onClick={() => {
              navigator.clipboard?.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            aria-label="Copy message"
          >
            <Icon name={copied ? "check" : "copy"} size={14} />
          </button>
          {canRegenerate && (
            <button className="icon-btn small" onClick={onRegenerate} aria-label="Regenerate response" title="Regenerate with the current model">
              <Icon name="refresh" size={14} />
            </button>
          )}
          {message.usage && (message.usage.inputTokens || message.usage.outputTokens) ? (
            <span className="usage">
              {message.usage.inputTokens ?? "?"} in · {message.usage.outputTokens ?? "?"} out
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
