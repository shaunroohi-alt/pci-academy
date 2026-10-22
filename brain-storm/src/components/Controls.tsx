import { useEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
export function Key({
  active = false,
  dark = false,
  danger = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  dark?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`key ${dark ? "key-dark" : ""} ${active ? "is-active" : ""} ${danger ? "key-danger" : ""} ${className}`}
      aria-pressed={active || undefined}
      {...props}
    >
      {dark && <i aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Panel({
  title,
  children,
  className = "",
  actions,
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      <div className="panel-title">
        <span>{title}</span>
        {actions}
      </div>
      {children}
    </section>
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const numeric = props.type === "number";
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(String(props.value ?? ""));
  const pending = useRef<ChangeEvent<HTMLInputElement> | null>(null);
  useEffect(() => {
    if (!editing) setDraft(String(props.value ?? ""));
  }, [props.value, editing]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        {...props}
        type={numeric ? "text" : props.type}
        inputMode={numeric ? "decimal" : props.inputMode}
        role={numeric ? "spinbutton" : props.role}
        aria-valuemin={
          numeric && props.min !== undefined ? Number(props.min) : undefined
        }
        aria-valuemax={
          numeric && props.max !== undefined ? Number(props.max) : undefined
        }
        aria-valuenow={numeric ? Number(props.value) : undefined}
        value={editing ? draft : props.value}
        onFocus={(e) => {
          setDraft(String(props.value ?? ""));
          setEditing(true);
          props.onFocus?.(e);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (numeric) pending.current = e;
          else props.onChange?.(e);
        }}
        onBlur={(e) => {
          if (
            numeric &&
            pending.current &&
            draft.trim() !== "" &&
            Number.isFinite(Number(draft))
          )
            props.onChange?.(pending.current);
          pending.current = null;
          setEditing(false);
          props.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (numeric && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (numeric && e.key === "Escape") {
            pending.current = null;
            setDraft(String(props.value ?? ""));
            setEditing(false);
            e.currentTarget.blur();
          }
          props.onKeyDown?.(e);
        }}
      />
    </label>
  );
}
function NumericReadout({
  label,
  value,
  min,
  max,
  step,
  format,
  unit,
  disabled,
  begin,
  end,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  unit: string;
  disabled: boolean;
  begin?: () => void;
  end?: () => void;
  onCommit: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  const display = format
    ? format(value)
    : `${Number(value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0))}${unit ? ` ${unit}` : ""}`;
  return (
    <input
      className="knob-value"
      aria-label={`${label} value`}
      role="spinbutton"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={display}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={editing ? draft : display}
      title={`Drag ${label} or edit a value between ${min} and ${max}`}
      onFocus={() => {
        cancelled.current = false;
        setDraft(String(Number(value.toFixed(4))));
        setEditing(true);
        begin?.();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (
          !cancelled.current &&
          editing &&
          draft.trim() !== "" &&
          Number.isFinite(Number(draft))
        )
          onCommit(
            Math.min(
              max,
              Math.max(min, Math.round(Number(draft) / step) * step),
            ),
          );
        setEditing(false);
        end?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          cancelled.current = true;
          setEditing(false);
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  children: ReactNode;
}) {
  return (
    <label className="select-field">
      {label && <span>{label}</span>}
      <select aria-label={label || props["aria-label"]} {...props}>
        {children}
      </select>
    </label>
  );
}
export function Readout({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`lcd ${className}`}>{children}</div>;
}
export function Knob({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  unit = "",
  format,
  disabled = false,
  begin,
  end,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  format?: (n: number) => string;
  disabled?: boolean;
  begin?: () => void;
  end?: () => void;
  className?: string;
}) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const clamp = (n: number) =>
    Math.min(max, Math.max(min, Math.round(n / step) * step));
  const angle =
    -135 + Math.max(0, Math.min(1, (value - min) / (max - min))) * 270;
  const display = format
    ? format(value)
    : `${Number(value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0))}${unit ? ` ${unit}` : ""}`;
  return (
    <div className={`knob ${className} ${disabled ? "is-disabled" : ""}`}>
      <label>{label}</label>
      <div className="knob-scale">
        <div
          className="knob-cap"
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={display}
          aria-disabled={disabled}
          onPointerDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            begin?.();
            drag.current = { y: e.clientY, value };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              onChange(
                clamp(
                  drag.current.value +
                    ((drag.current.y - e.clientY) * (max - min)) / 130,
                ),
              );
          }}
          onPointerUp={() => {
            if (drag.current) {
              drag.current = null;
              end?.();
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
            end?.();
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            let next = value;
            if (e.key === "ArrowUp" || e.key === "ArrowRight") next += step;
            if (e.key === "ArrowDown" || e.key === "ArrowLeft") next -= step;
            if (e.key === "Home") next = min;
            if (e.key === "End") next = max;
            if (next !== value) {
              e.preventDefault();
              onChange(clamp(next));
            }
          }}
        >
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="32" />
            <path transform={`rotate(${angle} 40 40)`} d="M40 17 L40 31" />
          </svg>
        </div>
      </div>
      <NumericReadout
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        unit={unit}
        format={format}
        disabled={disabled}
        begin={begin}
        end={end}
        onCommit={onChange}
      />
    </div>
  );
}
export function Meter({
  value,
  label = "Output",
  vertical = false,
}: {
  value: number;
  label?: string;
  vertical?: boolean;
}) {
  return (
    <div
      className={`meter ${vertical ? "vertical" : ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
    >
      <i
        style={
          vertical
            ? { height: `${Math.min(1, value) * 100}%` }
            : { width: `${Math.min(1, value) * 100}%` }
        }
      />
    </div>
  );
}
