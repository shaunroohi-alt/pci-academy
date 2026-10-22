"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { ProviderStatus } from "@/lib/shared/types";
import { Icon } from "./Icon";

type Health = Awaited<ReturnType<typeof api.health>>;

export function StatusDialog({ providers, onClose, onReload }: { providers: ProviderStatus[]; onClose: () => void; onReload: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function check(deep: boolean) {
    setChecking(true);
    try {
      setHealth(await api.health(deep));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    api.health(false).then(setHealth, (e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="System status">
        <div className="drawer-head">
          <h2>System status</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {err && <div className="msg-error">{err}</div>}
        <p className="small">
          Server: <b className={health?.status === "ok" ? "ok" : "bad"}>{health?.status ?? "…"}</b> · Storage: <b>{health?.storage ?? "…"}</b>
        </p>
        <table className="status-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Configured</th>
              <th>API check</th>
              <th>Models</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => {
              const h = health?.providers[p.id];
              return (
                <tr key={p.id}>
                  <td>
                    <span className={`dot p-${p.id}`} /> {p.label}
                  </td>
                  <td>{p.configured ? "yes" : "no"}</td>
                  <td>{h?.reachable === undefined ? "—" : h.reachable ? <span className="ok">reachable</span> : <span className="bad">{h.error}</span>}</td>
                  <td>
                    {p.models.length} <small className="muted">({p.modelSource})</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {providers.some((p) => p.note) && (
          <ul className="small muted notes">
            {providers.filter((p) => p.note).map((p) => (
              <li key={p.id}>
                <b>{p.label}:</b> {p.note}
              </li>
            ))}
          </ul>
        )}
        <div className="row gap">
          <button className="btn" onClick={() => check(true)} disabled={checking}>
            <Icon name="pulse" size={14} /> {checking ? "Checking…" : "Test API keys"}
          </button>
          <button className="btn ghost" onClick={onReload}>
            <Icon name="refresh" size={14} /> Reload model lists
          </button>
        </div>
        <p className="small muted">Keys are read from the server&apos;s environment (.env) and never sent to the browser. Edit .env and restart to change them.</p>
      </div>
    </div>
  );
}
