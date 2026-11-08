"use client";

import { useEffect, useRef, useState } from "react";
import { fileToAttachment, formatBytes } from "@/lib/client/files";
import type { Attachment, ProviderCapabilities } from "@/lib/shared/types";
import { Icon } from "./Icon";

export function Composer({
  busy,
  onSend,
  onStop,
  maxAttachmentBytes,
  capabilities,
  allowAttachments = true,
  placeholder = "Message…  (Enter to send, Shift+Enter for a new line)",
  disabledReason,
}: {
  busy: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  maxAttachmentBytes: number;
  capabilities?: ProviderCapabilities;
  allowAttachments?: boolean;
  placeholder?: string;
  disabledReason?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [text]);

  async function addFiles(list: FileList | File[]) {
    setWarn(null);
    const next: Attachment[] = [];
    for (const f of Array.from(list)) {
      try {
        next.push(await fileToAttachment(f, maxAttachmentBytes));
      } catch (e) {
        setWarn((e as Error).message);
      }
    }
    setFiles((prev) => [...prev, ...next].slice(0, 10));
  }

  const unsupported = files.filter((f) => (f.kind === "image" && capabilities && !capabilities.images) || (f.kind === "pdf" && capabilities && !capabilities.pdf));

  function submit() {
    if (busy || disabledReason) return;
    if (!text.trim() && !files.length) return;
    onSend(text, files);
    setText("");
    setFiles([]);
    setWarn(null);
  }

  return (
    <div
      className={`composer ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        if (!allowAttachments) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!allowAttachments) return;
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {files.length > 0 && (
        <div className="chips">
          {files.map((f) => (
            <span key={f.id} className={`chip ${unsupported.includes(f) ? "warn" : ""}`} title={unsupported.includes(f) ? "This provider cannot read this file type; it will be replaced with a note." : undefined}>
              {f.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${f.mimeType};base64,${f.data}`} alt="" />
              ) : (
                <Icon name="file" size={14} />
              )}
              <span className="chip-name">{f.name}</span>
              <span className="chip-size">{formatBytes(f.size)}</span>
              <button className="icon-btn tiny" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {(warn || disabledReason) && <div className="composer-warn">{disabledReason ?? warn}</div>}
      <div className="composer-row">
        {allowAttachments && (
          <>
            <button className="icon-btn" onClick={() => input.current?.click()} aria-label="Attach files" title="Attach images, PDFs or text/code files">
              <Icon name="clip" size={18} />
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
        <textarea
          ref={ta}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (!allowAttachments) return;
            const pasted = Array.from(e.clipboardData.files);
            if (pasted.length) {
              e.preventDefault();
              addFiles(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message"
        />
        {busy ? (
          <button className="send-btn stop" onClick={onStop} aria-label="Stop generating">
            <Icon name="stop" size={16} />
          </button>
        ) : (
          <button className="send-btn" onClick={submit} disabled={Boolean(disabledReason) || (!text.trim() && !files.length)} aria-label="Send">
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
