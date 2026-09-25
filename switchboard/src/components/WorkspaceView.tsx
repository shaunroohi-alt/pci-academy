"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, describeError, streamRequest } from "@/lib/client/api";
import type { ProviderId, ProviderStatus, PublicConfig, WorkspaceEntry } from "@/lib/shared/types";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { ModelPicker } from "./ModelPicker";
import { Terminal } from "./Terminal";

type Item =
  | { kind: "user"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown; output?: string; isError?: boolean }
  | { kind: "error"; text: string }
  | { kind: "log"; text: string };

type Engine = "agent" | "claude-code";
const STORE_KEY = "switchboard.workspace.v1";

function load(): { items: Item[]; history: { role: "user" | "assistant"; content: string }[] } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { items: [], history: [] };
}

function ToolCard({ item }: { item: Extract<Item, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const summary = (() => {
    const i = item.input as Record<string, unknown> | undefined;
    if (!i) return "";
    return String(i.path ?? i.command ?? i.pattern ?? i.file_path ?? i.description ?? "").slice(0, 120);
  })();
  return (
    <div className={`tool ${item.output === undefined ? "pending" : item.isError ? "failed" : "ok"}`}>
      <button className="tool-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="chevron" size={12} className={open ? "rot90" : ""} />
        <code>{item.name || "tool"}</code>
        <span className="tool-sum">{summary}</span>
        <span className="tool-state">{item.output === undefined ? "running…" : item.isError ? "error" : "done"}</span>
      </button>
      {open && (
        <div className="tool-body">
          <pre>{JSON.stringify(item.input, null, 2)}</pre>
          {item.output !== undefined && <pre className="tool-out">{item.output}</pre>}
        </div>
      )}
    </div>
  );
}

export function WorkspaceView({ providers, config, defaultProvider, defaultModel }: { providers: ProviderStatus[]; config: PublicConfig; defaultProvider: ProviderId; defaultModel: string }) {
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<{ path: string; content: string; dirty: boolean } | null>(null);
  const [saved] = useState(load);
  const [items, setItems] = useState<Item[]>(saved.items);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>(saved.history);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<Engine>("agent");
  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [model, setModel] = useState(defaultModel);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ items: items.slice(-400), history: history.slice(-60) }));
    } catch {
      /* quota or disabled storage */
    }
  }, [items, history]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [items]);

  const refresh = useCallback(async () => {
    try {
      setEntries(await api.files());
      setFilesErr(null);
    } catch (e) {
      setFilesErr(e instanceof ApiError ? e.error.message : (e as Error).message);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .files()
      .then((e) => alive && setEntries(e))
      .catch((e) => alive && setFilesErr(e instanceof ApiError ? e.error.message : (e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  async function open(path: string) {
    if (openFile?.dirty && !confirm("Discard unsaved changes?")) return;
    try {
      setOpenFile({ path, content: await api.readFile(path), dirty: false });
    } catch (e) {
      setOpenFile({ path, content: `Could not open: ${e instanceof ApiError ? e.error.message : (e as Error).message}`, dirty: false });
    }
  }

  async function save() {
    if (!openFile) return;
    await api.writeFile(openFile.path, openFile.content);
    setOpenFile({ ...openFile, dirty: false });
    refresh();
  }

  const selected = providers.find((p) => p.id === provider);
  const agentDisabled =
    engine === "claude-code"
      ? config.claudeCodeCliEnabled
        ? undefined
        : "Claude Code CLI bridge is off. Install Claude Code, run `claude` once to sign in, then set ENABLE_CLAUDE_CODE_CLI=true."
      : !selected?.configured
        ? `${selected?.label ?? "Provider"} is not configured.`
        : !selected.capabilities.tools
          ? `${selected.label} has no tool calling enabled.`
          : undefined;

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    setItems((it) => [...it, { kind: "user", text: prompt }]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let finalText = "";
    const newHistory = [...history, { role: "user" as const, content: prompt }];
    const onEvent = (ev: import("@/lib/shared/types").StreamEvent) => {
      if (ev.type === "text") {
        finalText += ev.delta;
        setItems((it) => {
          const last = it[it.length - 1];
          if (last?.kind === "text") return [...it.slice(0, -1), { kind: "text", text: last.text + ev.delta }];
          return [...it, { kind: "text", text: ev.delta }];
        });
      } else if (ev.type === "tool_call") {
        finalText = "";
        setItems((it) => [...it, { kind: "tool", id: ev.id, name: ev.name, input: ev.input }]);
      } else if (ev.type === "tool_result") {
        setItems((it) => it.map((x) => (x.kind === "tool" && x.id === ev.id ? { ...x, output: ev.output, isError: ev.isError, name: x.name || ev.name } : x)));
        if (["write_file", "edit_file", "run_command", "Write", "Edit", "Bash"].includes(ev.name) || !ev.name) refresh();
      } else if (ev.type === "error") {
        setItems((it) => [...it, { kind: "error", text: describeError(ev.error) }]);
      } else if (ev.type === "log" && ev.stream !== "stdout") {
        setItems((it) => [...it, { kind: "log", text: ev.text }]);
      }
    };
    try {
      if (engine === "claude-code") {
        await streamRequest("/api/workspace/claude-code", { prompt }, onEvent, ctrl.signal);
      } else {
        await streamRequest("/api/workspace/agent", { provider, model, messages: newHistory }, onEvent, ctrl.signal);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? describeError(e.error) : (e as Error).name === "AbortError" ? "Stopped." : (e as Error).message;
      setItems((it) => [...it, { kind: "error", text: msg }]);
    } finally {
      setHistory(finalText.trim() ? [...newHistory, { role: "assistant", content: finalText.trim() }] : newHistory);
      setBusy(false);
      abort.current = null;
      refresh();
    }
  }

  const depth = (p: string) => p.split("/").length - 1;

  return (
    <div className="workspace">
      <section className="ws-files">
        <div className="panel-head">
          <span>
            <Icon name="folder" size={14} /> workspace/
          </span>
          <button className="icon-btn small" onClick={refresh} aria-label="Refresh files">
            <Icon name="refresh" size={13} />
          </button>
        </div>
        <div className="tree">
          {filesErr && <div className="msg-error">{filesErr}</div>}
          {!filesErr && entries.length === 0 && <p className="muted small pad">Empty. Ask the agent to create something, or mount a project at WORKSPACE_DIR.</p>}
          {entries.map((e) => (
            <button
              key={e.path}
              className={`tree-item ${e.type} ${openFile?.path === e.path ? "active" : ""}`}
              style={{ paddingLeft: 10 + depth(e.path) * 14 }}
              onClick={() => e.type === "file" && open(e.path)}
              title={e.path}
            >
              <Icon name={e.type === "dir" ? "folder" : "file"} size={13} />
              <span>{e.path.split("/").pop()}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ws-agent">
        <div className="ws-toolbar">
          <div className="seg">
            <button className={engine === "agent" ? "active" : ""} onClick={() => setEngine("agent")}>
              <Icon name="bolt" size={13} /> API agent
            </button>
            <button className={engine === "claude-code" ? "active" : ""} onClick={() => setEngine("claude-code")} title="Runs the official Claude Code CLI locally">
              <Icon name="terminal" size={13} /> Claude Code CLI
            </button>
          </div>
          {engine === "agent" && (
            <ModelPicker
              providers={providers}
              provider={provider}
              model={model}
              requireTools
              onChange={(p, m) => {
                setProvider(p);
                setModel(m);
              }}
            />
          )}
          <button
            className="icon-btn small push-right"
            onClick={() => {
              setItems([]);
              setHistory([]);
            }}
            disabled={busy}
            title="Clear agent session"
          >
            <Icon name="trash" size={13} /> Clear
          </button>
        </div>
        <div className="ws-log" ref={log}>
          {items.length === 0 && (
            <div className="ws-empty">
              <h2>Coding workspace</h2>
              <p className="muted">
                Give the agent a task. It can list, read, search, create and edit files inside <code>workspace/</code>
                {config.shellEnabled ? " and run shell commands" : " (shell is disabled)"}. Every tool call is shown below.
              </p>
              <ul className="muted small">
                <li>“Create a Python CLI that converts CSV to JSON, with a README.”</li>
                <li>“Find TODOs in this project and fix the easy ones.”</li>
                <li>“Add unit tests for utils.ts and run them.”</li>
              </ul>
            </div>
          )}
          {items.map((it, i) =>
            it.kind === "user" ? (
              <div key={i} className="ws-user">{it.text}</div>
            ) : it.kind === "text" ? (
              <div key={i} className="ws-text">
                <Markdown text={it.text} />
              </div>
            ) : it.kind === "tool" ? (
              <ToolCard key={i} item={it} />
            ) : it.kind === "error" ? (
              <div key={i} className="msg-error">{it.text}</div>
            ) : (
              <pre key={i} className="ws-logline">{it.text}</pre>
            ),
          )}
          {busy && <div className="typing ws-typing"><i /><i /><i /></div>}
        </div>
        <div className="composer-wrap">
          <Composer
            busy={busy}
            onSend={(t) => send(t)}
            onStop={() => abort.current?.abort()}
            maxAttachmentBytes={config.maxAttachmentBytes}
            allowAttachments={false}
            placeholder="Describe a coding task…"
            disabledReason={agentDisabled}
          />
        </div>
      </section>

      <section className="ws-side">
        <div className="ws-editor">
          <div className="panel-head">
            <span>
              <Icon name="file" size={14} /> {openFile ? openFile.path : "No file open"}
              {openFile?.dirty && " •"}
            </span>
            {openFile && (
              <span className="row">
                <button className="icon-btn small" onClick={save} disabled={!openFile.dirty} aria-label="Save file">
                  <Icon name="save" size={13} /> Save
                </button>
                <button className="icon-btn small" onClick={() => setOpenFile(null)} aria-label="Close file">
                  <Icon name="x" size={13} />
                </button>
              </span>
            )}
          </div>
          {openFile ? (
            <textarea
              className="editor"
              spellCheck={false}
              value={openFile.content}
              onChange={(e) => setOpenFile({ ...openFile, content: e.target.value, dirty: true })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          ) : (
            <p className="muted small pad">Select a file to view or edit it.</p>
          )}
        </div>
        <Terminal enabled={config.shellEnabled} onCommandFinished={refresh} />
      </section>
    </div>
  );
}
