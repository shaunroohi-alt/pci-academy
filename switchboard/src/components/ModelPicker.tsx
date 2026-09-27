"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderId, ProviderStatus } from "@/lib/shared/types";
import { Icon } from "./Icon";

export function providerShort(p: ProviderStatus | undefined, id: ProviderId): string {
  if (p) return p.label.replace(/^Anthropic /, "").replace(/^Google /, "");
  return id;
}

export function ModelPicker({
  providers,
  provider,
  model,
  onChange,
  requireTools = false,
}: {
  providers: ProviderStatus[];
  provider: ProviderId;
  model: string;
  onChange: (provider: ProviderId, model: string) => void;
  requireTools?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ProviderId>(provider);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = providers.find((p) => p.id === provider);
  const shown = providers.find((p) => p.id === active) ?? providers[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const models = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (shown?.models ?? []).filter((m) => !f || m.id.toLowerCase().includes(f) || m.label.toLowerCase().includes(f));
  }, [shown, filter]);

  const usable = (p: ProviderStatus) => p.configured && (!requireTools || p.capabilities.tools);

  return (
    <div className="picker" ref={ref}>
      <button
        className="picker-btn"
        onClick={() => {
          setActive(provider);
          setFilter("");
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`dot p-${provider}`} />
        <span className="picker-provider">{providerShort(current, provider)}</span>
        <span className="picker-model">{model || "select a model"}</span>
        <Icon name="chevron" size={14} className="rot90" />
      </button>
      {open && (
        <div className="picker-pop" role="dialog">
          <div className="picker-providers">
            {providers.map((p) => (
              <button key={p.id} className={`picker-prov ${p.id === active ? "active" : ""} ${usable(p) ? "" : "muted"}`} onClick={() => setActive(p.id)}>
                <span className={`dot p-${p.id}`} />
                <span>{providerShort(p, p.id)}</span>
                {!p.configured && <span className="tag">setup</span>}
                {p.configured && requireTools && !p.capabilities.tools && <span className="tag">no tools</span>}
              </button>
            ))}
          </div>
          <div className="picker-models">
            {shown && !shown.configured ? (
              <div className="picker-empty">
                <strong>{shown.label} is not configured.</strong>
                <p>{shown.note ?? "Add its API key to .env and restart the server."}</p>
              </div>
            ) : shown && requireTools && !shown.capabilities.tools ? (
              <div className="picker-empty">
                <strong>Agent mode needs tool calling.</strong>
                <p>{shown.id === "astra" ? "Set ASTRA_SUPPORTS_TOOLS=true if your endpoint supports OpenAI-style function calling." : "This provider has no tool support here."}</p>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  className="picker-filter"
                  placeholder="Filter or type a model id…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && shown) {
                      const id = models[0]?.id ?? filter.trim();
                      if (id) {
                        onChange(shown.id, id);
                        setOpen(false);
                      }
                    }
                  }}
                />
                <div className="picker-list" role="listbox">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      role="option"
                      aria-selected={shown?.id === provider && m.id === model}
                      className={`picker-item ${shown?.id === provider && m.id === model ? "selected" : ""}`}
                      onClick={() => {
                        onChange(shown!.id, m.id);
                        setOpen(false);
                      }}
                    >
                      <span>{m.label}</span>
                      {m.label !== m.id && <code>{m.id}</code>}
                    </button>
                  ))}
                  {filter.trim() && !models.some((m) => m.id === filter.trim()) && (
                    <button
                      className="picker-item"
                      onClick={() => {
                        onChange(shown!.id, filter.trim());
                        setOpen(false);
                      }}
                    >
                      <span>Use custom id</span>
                      <code>{filter.trim()}</code>
                    </button>
                  )}
                  {!models.length && !filter && <div className="picker-empty">No models listed. Type a model id above.</div>}
                </div>
                <div className="picker-foot">
                  {shown?.modelSource === "api" ? "Live list from provider API" : shown?.modelSource === "env" ? "From .env" : "Built-in defaults"}
                  {shown?.note && <span title={shown.note}> · ⚠</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
