import { useEffect, useMemo, useRef, useState } from "react";
import type { ConsoleProps } from "../ui-contracts";
import { Key } from "./Controls";
export function Waveform({
  p,
  overview = false,
}: {
  p: ConsoleProps;
  overview?: boolean;
}) {
  const [zoom, setZoom] = useState(1),
    [frozen, setFrozen] = useState(false),
    [origin, setOrigin] = useState(0);
  const drag = useRef<"start" | "end" | "seek" | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const info = p.state.source,
    buffer = info ? p.engine.getBuffer(info.assetId) : undefined,
    duration = info?.duration || 1;
  const selected = p.state.cues[p.view.selection[0] ?? 0];
  const stems = p.engine.getStems();
  const mask = p.state.stemMute.map((m, i) => m || selected?.stemMute[i]);
  const range = overview ? duration : duration / zoom,
    start = overview
      ? 0
      : Math.min(Math.max(0, origin), Math.max(0, duration - range));
  const height = overview ? 36 : 174;
  useEffect(() => {
    if (
      !overview &&
      !frozen &&
      p.audio.sourcePlaying &&
      (p.audio.sourceTime < start || p.audio.sourceTime > start + range)
    )
      setOrigin(Math.max(0, p.audio.sourceTime - range * 0.2));
  }, [
    overview,
    frozen,
    p.audio.sourcePlaying,
    p.audio.sourceTime,
    start,
    range,
  ]);
  useEffect(() => {
    if (overview) return;
    const handler = (event: Event) => {
      const direction = (event as CustomEvent).detail;
      setZoom((old) => {
        const next =
          direction === 1 || direction === "in"
            ? Math.min(256, old * 2)
            : Math.max(1, old / 2);
        setOrigin(Math.max(0, p.audio.sourceTime - duration / next / 2));
        return next;
      });
    };
    window.addEventListener("brainstorm:zoom", handler);
    return () => window.removeEventListener("brainstorm:zoom", handler);
  }, [overview, p.audio.sourceTime, duration]);
  const path = useMemo(() => {
    if (!buffer) return "";
    const ready = stems.length === 4 && stems.every(Boolean);
    const channels = ready
      ? stems.map((s) => s!.getChannelData(0))
      : [buffer.getChannelData(0)];
    let upper = "",
      lower = "";
    const samples = buffer.sampleRate;
    for (let x = 0; x <= 1000; x += 2) {
      let peak = 0;
      const from = Math.floor((start + (x / 1000) * range) * samples),
        to = Math.min(
          buffer.length,
          Math.floor((start + ((x + 2) / 1000) * range) * samples),
        );
      const stride = Math.max(1, Math.floor((to - from) / 18));
      for (let n = from; n < to; n += stride) {
        let v = 0;
        if (ready) {
          for (let c = 0; c < 4; c++) if (!mask[c]) v += channels[c][n] || 0;
        } else v = channels[0][n] || 0;
        peak = Math.max(peak, Math.abs(v));
      }
      peak = Math.min(1, peak);
      const y = height * 0.44 * peak;
      upper += `${x === 0 ? "M" : "L"}${x},${height / 2 - y} `;
      lower = `L${x},${height / 2 + y} ` + lower;
    }
    return upper + lower + "Z";
  }, [
    buffer,
    stems[0],
    stems[1],
    stems[2],
    stems[3],
    mask.join(","),
    range,
    start,
    height,
  ]);
  const timeAt = (clientX: number) => {
    const b = svg.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(duration, start + ((clientX - b.left) / b.width) * range),
    );
  };
  const seek = (t: number) => {
    p.engine.seekSource(t);
    if (overview && !frozen) setOrigin(Math.max(0, t - range / 2));
  };
  const cueX = (n: number) => ((n - start) / range) * 1000;
  const markers = useMemo(() => {
    const result: number[] = [];
    if (!p.state.beatgrid || !buffer) return result;
    const step = 60 / p.state.sourceBpm;
    for (
      let t = Math.floor(start / step) * step;
      t < start + range && result.length < 300;
      t += step
    )
      if (t >= start) result.push(t);
    return result;
  }, [p.state.beatgrid, p.state.sourceBpm, start, range, buffer]);
  return (
    <div className={`waveform-shell ${overview ? "overview" : "detail"}`}>
      {!overview && (
        <div className="wave-tools">
          <Key
            title="Zoom out"
            aria-label="Zoom waveform out"
            onClick={() => setZoom(Math.max(1, zoom / 2))}
          >
            −
          </Key>
          <Key
            title="Zoom in"
            aria-label="Zoom waveform in"
            onClick={() => {
              setOrigin(
                Math.max(0, p.audio.sourceTime - duration / (zoom * 2) / 2),
              );
              setZoom(Math.min(256, zoom * 2));
            }}
          >
            +
          </Key>
          <Key
            active={frozen}
            title="Freeze waveform view"
            onClick={() => setFrozen(!frozen)}
          >
            FREEZE
          </Key>
        </div>
      )}
      <svg
        ref={svg}
        role="img"
        aria-label={
          overview
            ? "Source overview, click to seek"
            : "Sample waveform, drag cue handles to trim"
        }
        viewBox={`0 0 1000 ${height}`}
        preserveAspectRatio="none"
        onPointerDown={(e) => {
          if (!info || !buffer) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = timeAt(e.clientX),
            threshold =
              (range * 12) / e.currentTarget.getBoundingClientRect().width;
          drag.current =
            !overview &&
            !selected?.empty &&
            Math.abs(t - selected.start) < threshold
              ? "start"
              : !overview &&
                  !selected?.empty &&
                  Math.abs(t - selected.end) < threshold
                ? "end"
                : "seek";
          if (drag.current === "seek") seek(t);
          else p.beginGesture();
        }}
        onPointerMove={(e) => {
          if (!drag.current || !info) return;
          const t = timeAt(e.clientX);
          if (drag.current === "seek") seek(t);
          else {
            const edge = drag.current;
            p.change((s) => {
              for (const index of p.view.selection) {
                const c = s.cues[index];
                if (c.empty) continue;
                let target = t;
                if (s.quantize) {
                  const grid = 60 / s.sourceBpm / 8;
                  target = Math.round(t / grid) * grid;
                }
                if (edge === "start")
                  c.start = Math.max(0, Math.min(c.end - 0.001, target));
                else
                  c.end = Math.min(duration, Math.max(c.start + 0.001, target));
              }
            });
          }
        }}
        onPointerUp={() => {
          if (drag.current && drag.current !== "seek") p.endGesture();
          drag.current = null;
        }}
        onPointerCancel={() => {
          p.endGesture();
          drag.current = null;
        }}
      >
        <rect width="1000" height={height} fill="#acb982" />
        {markers.map((t, i) => (
          <line
            key={i}
            x1={cueX(t)}
            x2={cueX(t)}
            y1="0"
            y2={height}
            stroke="#738252"
            strokeWidth=".6"
            opacity=".5"
          />
        ))}
        <path d={path} fill="#4c6235" />
        {overview &&
          p.state.cues
            .filter((c) => !c.empty)
            .map((c) => (
              <g key={c.id}>
                <rect
                  x={(c.start / duration) * 1000}
                  y="0"
                  width={Math.max(1, ((c.end - c.start) / duration) * 1000)}
                  height={height}
                  fill={c.colour}
                  opacity=".14"
                />
                <path
                  d={`M${(c.start / duration) * 1000} 0l13 11h-13Z`}
                  fill={c.colour}
                />
              </g>
            ))}
        {!overview && selected && !selected.empty && (
          <g fill={selected.colour}>
            <rect
              x={Math.max(0, cueX(selected.start))}
              y="0"
              width="3"
              height={height}
            />
            <path d={`M${cueX(selected.start)} 0l15 11h-15Z`} />
            <rect x={cueX(selected.end) - 3} y="0" width="3" height={height} />
            <path d={`M${cueX(selected.end)} 0l-15 11h15Z`} />
          </g>
        )}
        {!overview &&
          p.view.module === "grid" &&
          p.state.tempoMarkers.map((m, i) => (
            <g key={i}>
              <line
                x1={cueX(m.time)}
                x2={cueX(m.time)}
                y1="0"
                y2={height}
                stroke="#b15f42"
                strokeWidth="2"
              />
              <text x={cueX(m.time) + 5} y="16" fontSize="13" fill="#34422b">
                {m.bpm.toFixed(1)}
              </text>
            </g>
          ))}
        <line
          x1={cueX(p.audio.sourceTime)}
          x2={cueX(p.audio.sourceTime)}
          y1="0"
          y2={height}
          stroke="#343d2b"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
