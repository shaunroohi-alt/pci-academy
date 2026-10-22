"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, describeError, streamRequest } from "@/lib/client/api";
import { Icon } from "./Icon";

interface Line {
  text: string;
  kind: "cmd" | "stdout" | "stderr" | "info";
}

export function Terminal({ enabled, onCommandFinished }: { enabled: boolean; onCommandFinished: () => void }) {
  const [lines, setLines] = useState<Line[]>([{ kind: "info", text: enabled ? "Workspace terminal. Commands run with sh in the workspace root." : "Terminal disabled. Set ENABLE_SHELL=true in .env to run commands (only on machines you trust)." }]);
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const out = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [lines]);

  async function run() {
    const c = cmd.trim();
    if (!c || running) return;
    setCmd("");
    setHistory((h) => [c, ...h.filter((x) => x !== c)].slice(0, 50));
    setHIdx(-1);
    if (c === "clear") {
      setLines([]);
      return;
    }
    setLines((l) => [...l, { kind: "cmd", text: `$ ${c}` }]);
    setRunning(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await streamRequest(
        "/api/workspace/exec",
        { command: c },
        (ev) => {
          if (ev.type === "log") setLines((l) => [...l, { kind: ev.stream, text: ev.text }]);
          if (ev.type === "done" && ev.stopReason && ev.stopReason !== "exit 0") setLines((l) => [...l, { kind: "info", text: `[${ev.stopReason}]` }]);
          if (ev.type === "error") setLines((l) => [...l, { kind: "stderr", text: describeError(ev.error) }]);
        },
        ctrl.signal,
      );
    } catch (e) {
      const msg = e instanceof ApiError ? describeError(e.error) : (e as Error).name === "AbortError" ? "[interrupted]" : (e as Error).message;
      setLines((l) => [...l, { kind: "stderr", text: msg }]);
    } finally {
      setRunning(false);
      abort.current = null;
      onCommandFinished();
    }
  }

  return (
    <div className="terminal">
      <div className="panel-head">
        <span>
          <Icon name="terminal" size={14} /> Terminal
        </span>
        {running && (
          <button className="icon-btn small" onClick={() => abort.current?.abort()}>
            <Icon name="stop" size={12} /> Ctrl+C
          </button>
        )}
      </div>
      <div className="term-out" ref={out}>
        {lines.map((l, i) => (
          <pre key={i} className={`term-${l.kind}`}>
            {l.text}
          </pre>
        ))}
      </div>
      <div className="term-in">
        <span>$</span>
        <input
          value={cmd}
          disabled={!enabled}
          placeholder={enabled ? (running ? "running…" : "npm test, git status, ls -la …") : "disabled"}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
            else if (e.key === "c" && e.ctrlKey && running) abort.current?.abort();
            else if (e.key === "ArrowUp" && history.length) {
              const i = Math.min(hIdx + 1, history.length - 1);
              setHIdx(i);
              setCmd(history[i]);
              e.preventDefault();
            } else if (e.key === "ArrowDown") {
              const i = hIdx - 1;
              setHIdx(Math.max(i, -1));
              setCmd(i >= 0 ? history[i] : "");
              e.preventDefault();
            }
          }}
          aria-label="Terminal command"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
