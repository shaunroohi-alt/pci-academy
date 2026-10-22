"use client";

import type { ChatSettings } from "@/lib/shared/types";
import { Icon } from "./Icon";

const PRESETS: { name: string; prompt: string }[] = [
  { name: "None", prompt: "" },
  { name: "Concise expert", prompt: "You are a precise, senior-level expert. Answer directly, skip filler, and flag uncertainty explicitly." },
  { name: "Code reviewer", prompt: "You are a meticulous code reviewer. Point out bugs, security issues and unclear code first, then suggest concrete fixes with code." },
  { name: "Teacher", prompt: "Explain concepts step by step with small examples. Check understanding with a short question at the end." },
  { name: "Writer", prompt: "You are an editor. Improve clarity and flow while keeping the author's voice. Return the revised text, then a brief list of changes." },
];

export function SettingsDrawer({
  settings,
  onChange,
  onClose,
}: {
  settings: ChatSettings;
  onChange: (patch: Partial<ChatSettings>) => void;
  onClose: () => void;
}) {
  const tempOn = settings.temperature !== undefined;
  return (
    <aside className="drawer" aria-label="Conversation settings">
      <div className="drawer-head">
        <h2>Conversation settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          <Icon name="x" />
        </button>
      </div>
      <label className="field">
        <span>System prompt</span>
        <textarea rows={8} value={settings.systemPrompt} placeholder="Optional instructions applied to every turn…" onChange={(e) => onChange({ systemPrompt: e.target.value })} />
      </label>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} className={`pill ${settings.systemPrompt === p.prompt ? "active" : ""}`} onClick={() => onChange({ systemPrompt: p.prompt })}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="field">
        <span className="row-between">
          <span>Temperature</span>
          <label className="check">
            <input type="checkbox" checked={tempOn} onChange={(e) => onChange({ temperature: e.target.checked ? 0.7 : undefined })} /> custom
          </label>
        </span>
        <input type="range" min={0} max={2} step={0.05} disabled={!tempOn} value={settings.temperature ?? 1} onChange={(e) => onChange({ temperature: Number(e.target.value) })} />
        <small>{tempOn ? settings.temperature?.toFixed(2) : "Provider default. Current Claude models and OpenAI reasoning models ignore or reject custom sampling, so leave this off unless you need it."}</small>
      </div>
      <label className="field">
        <span>Max output tokens</span>
        <input
          type="number"
          min={1}
          placeholder="Provider default"
          value={settings.maxTokens ?? ""}
          onChange={(e) => onChange({ maxTokens: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}
        />
      </label>
      <p className="muted small">Settings are saved with the conversation when you send the next message. New chats start from the last settings you used.</p>
    </aside>
  );
}
