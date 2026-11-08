"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import type { ChatSettings, Conversation, ConversationSummary, ProviderId, ProviderStatus, PublicConfig } from "@/lib/shared/types";
import { ChatView } from "./ChatView";
import { Icon } from "./Icon";
import { ModelPicker } from "./ModelPicker";
import { SettingsDrawer } from "./SettingsDrawer";
import { StatusDialog } from "./StatusDialog";
import { WorkspaceView } from "./WorkspaceView";

const DEFAULTS_KEY = "switchboard.defaults.v1";

function readDefaults(): Partial<ChatSettings> {
  try {
    return JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeDefaults(s: ChatSettings) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

function pickInitial(providers: ProviderStatus[], config: PublicConfig, saved: Partial<ChatSettings>): ChatSettings {
  const usable = providers.filter((p) => p.configured);
  const byId = (id?: string) => providers.find((p) => p.id === id && p.configured);
  const prov = byId(saved.provider) ?? byId(config.defaultProvider) ?? usable[0] ?? providers[0];
  const model =
    (saved.provider === prov?.id && saved.model) ||
    (config.defaultProvider === prov?.id && config.defaultModel) ||
    prov?.defaultModel ||
    prov?.models[0]?.id ||
    "";
  return { provider: (prov?.id ?? "anthropic") as ProviderId, model, systemPrompt: saved.systemPrompt ?? "", temperature: saved.temperature, maxTokens: saved.maxTokens };
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1 && new Date().getDate() === d.getDate()) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  return "Older";
}

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [view, setView] = useState<"chat" | "workspace">("chat");
  const [drawer, setDrawer] = useState(false);
  const [status, setStatus] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    api.conversations().then(setList).catch(() => undefined);
  }, []);

  const loadProviders = useCallback(async (live = true) => {
    const p = await api.models(live);
    setProviders(p);
    return p;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, p] = await Promise.all([api.config(), api.models(false)]);
        setConfig(cfg);
        setProviders(p);
        setSettings(pickInitial(p, cfg, readDefaults()));
        refreshList();
        const id = new URL(location.href).searchParams.get("c");
        if (id) openConversation(id);
        // Upgrade to live model lists in the background.
        loadProviders(true).catch(() => undefined);
      } catch (e) {
        setLoadErr((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (config) document.title = conv?.title ? `${conv.title} · ${config.appName}` : config.appName;
  }, [conv, config]);

  function setUrl(id: string | null) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    history.replaceState(null, "", url);
  }

  async function openConversation(id: string) {
    try {
      const c = await api.conversation(id);
      setConv(c);
      setSettings({ provider: c.provider, model: c.model, systemPrompt: c.systemPrompt, temperature: c.temperature, maxTokens: c.maxTokens });
      setChatKey((k) => k + 1);
      setView("chat");
      setUrl(id);
      setSidebar(false);
    } catch {
      setUrl(null);
    }
  }

  function newChat() {
    setConv(null);
    setChatKey((k) => k + 1);
    setUrl(null);
    setView("chat");
    setSidebar(false);
    if (providers.length && config) setSettings(pickInitial(providers, config, readDefaults()));
  }

  function updateSettings(patch: Partial<ChatSettings>) {
    setSettings((s) => {
      if (!s) return s;
      const next = { ...s, ...patch };
      writeDefaults(next);
      return next;
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await api.deleteConversation(id);
    if (conv?.id === id) newChat();
    refreshList();
  }

  async function rename(c: ConversationSummary) {
    const title = prompt("Rename conversation", c.title)?.trim();
    if (!title) return;
    await api.patchConversation(c.id, { title });
    refreshList();
  }

  const onCreated = useCallback((id: string) => {
    setUrl(id);
    setConv((c) => (c && c.id === id ? c : ({ id } as Conversation)));
    refreshList();
  }, [refreshList]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, ConversationSummary[]>();
    for (const c of list.filter((c) => !q || c.title.toLowerCase().includes(q) || c.model.toLowerCase().includes(q))) {
      const g = groupLabel(c.updatedAt);
      out.set(g, [...(out.get(g) ?? []), c]);
    }
    return [...out.entries()];
  }, [list, query]);

  if (loadErr) {
    return (
      <div className="boot">
        <h1>Could not reach the server</h1>
        <p className="muted">{loadErr}</p>
        <button className="btn" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!config || !settings) {
    return (
      <div className="boot">
        <div className="typing"><i /><i /><i /></div>
      </div>
    );
  }

  const configuredCount = providers.filter((p) => p.configured).length;

  return (
    <div className={`app ${sidebar ? "sidebar-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <span>{config.appName}</span>
        </div>
        <button className="btn new" onClick={newChat}>
          <Icon name="plus" /> New chat
        </button>
        <nav className="nav">
          <button className={view === "chat" ? "active" : ""} onClick={() => { setView("chat"); setSidebar(false); }}>
            <Icon name="chat" /> Chat
          </button>
          <button className={view === "workspace" ? "active" : ""} onClick={() => { setView("workspace"); setSidebar(false); }}>
            <Icon name="terminal" /> Code workspace
          </button>
        </nav>
        <input className="search" placeholder="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search conversations" />
        <div className="conv-list">
          {grouped.length === 0 && <p className="muted small pad">No conversations yet.</p>}
          {grouped.map(([g, items]) => (
            <div key={g}>
              <div className="conv-group">{g}</div>
              {items.map((c) => (
                <div key={c.id} className={`conv ${conv?.id === c.id && view === "chat" ? "active" : ""}`}>
                  <button className="conv-main" onClick={() => openConversation(c.id)} title={`${c.title}\n${c.provider} · ${c.model}`}>
                    <span className={`dot p-${c.provider}`} />
                    <span className="conv-title">{c.title}</span>
                  </button>
                  <button className="icon-btn tiny" onClick={() => rename(c)} aria-label="Rename">
                    <Icon name="edit" size={12} />
                  </button>
                  <button className="icon-btn tiny" onClick={() => remove(c.id)} aria-label="Delete">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <button className="status-btn" onClick={() => setStatus(true)}>
          <span className={`health ${configuredCount ? "ok" : "bad"}`} />
          {configuredCount}/{providers.length} providers ready
        </button>
      </aside>
      <div className="scrim" onClick={() => setSidebar(false)} />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebar(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          {view === "chat" ? (
            <>
              <ModelPicker providers={providers} provider={settings.provider} model={settings.model} onChange={(provider, model) => updateSettings({ provider, model })} />
              <div className="topbar-title">{conv?.title ?? list.find((c) => c.id === conv?.id)?.title}</div>
              <button className={`icon-btn ${settings.systemPrompt ? "lit" : ""}`} onClick={() => setDrawer((d) => !d)} aria-label="Conversation settings" title="System prompt & parameters">
                <Icon name="sliders" />
              </button>
            </>
          ) : (
            <div className="topbar-title">Code workspace</div>
          )}
        </header>
        <div className="content">
          {view === "chat" ? (
            <ChatView
              key={chatKey}
              conversationId={conv?.id ?? null}
              initialMessages={conv?.messages ?? []}
              settings={settings}
              providers={providers}
              config={config}
              onConversationCreated={onCreated}
              onActivity={refreshList}
            />
          ) : (
            <WorkspaceView providers={providers} config={config} defaultProvider={settings.provider} defaultModel={settings.model} />
          )}
          {drawer && view === "chat" && <SettingsDrawer settings={settings} onChange={updateSettings} onClose={() => setDrawer(false)} />}
        </div>
      </main>
      {status && (
        <StatusDialog
          providers={providers}
          onClose={() => setStatus(false)}
          onReload={() => loadProviders(true)}
        />
      )}
    </div>
  );
}
