import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { ConsoleProps } from "../ui-contracts";
import type { AssetInfo, Clip, PatternNote, SessionState } from "../model";
import { cueColours, quantize, uid } from "../model";
import { Knob } from "./Controls";

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const number = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "0");
const gridName = (n: number) =>
  n === 0
    ? "FREE"
    : n === 1
      ? "1/4"
      : n === 0.5
        ? "1/8"
        : n === 0.25
          ? "1/16"
          : "1/32";
const padding = (n: number) => String(n + 1).padStart(2, "0");

function PatternLibrary(p: ConsoleProps) {
  return (
    <aside className="panel library" aria-label="Pattern cartridges">
      <h2 className="panel-title">PATTERN CARTRIDGES</h2>
      <div className="pattern-cartridges">
        {p.state.patterns.map((pattern, index) => (
          <button
            type="button"
            key={pattern.id}
            className={`key cartridge ${p.state.selectedPattern === index ? "is-active" : ""}`}
            aria-pressed={p.state.selectedPattern === index}
            title={`${pattern.name} · ${pattern.notes.length} notes. Double-click to rename.`}
            onClick={() =>
              p.change((s) => {
                s.selectedPattern = index;
              }, false)
            }
            onDoubleClick={() => {
              const name = window.prompt("Pattern name", pattern.name);
              if (name?.trim())
                p.change((s) => {
                  s.patterns[index].name = name.trim().slice(0, 48);
                });
            }}
          >
            <span>{padding(index)}</span> {pattern.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
function TrackChoice(p: ConsoleProps) {
  return (
    <label className="field">
      OUTPUT TRACK
      <select
        aria-label="Output track"
        value={p.state.selectedTrack}
        onChange={(e) =>
          p.change((s) => {
            s.selectedTrack = Number(e.target.value);
          }, false)
        }
      >
        {p.state.tracks.map((track, i) => (
          <option key={track.id} value={i}>
            {padding(i)} {track.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function TimingChoice(p: ConsoleProps) {
  return (
    <label className="field">
      TIMING GRID
      <select
        aria-label="Recording timing grid"
        value={p.state.recordQuantize}
        onChange={(e) =>
          p.change((s) => {
            s.recordQuantize = Number(e.target.value);
          })
        }
      >
        {[0, 1, 0.5, 0.25, 0.125].map((n) => (
          <option key={n} value={n}>
            {gridName(n)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EditorScrollControls({
  viewport,
  label,
}: {
  viewport: RefObject<HTMLDivElement | null>;
  label: string;
}) {
  return (
    <div
      className="editor-scroll-controls"
      aria-label={`${label} viewport controls`}
    >
      <button
        className="key"
        aria-label={`Scroll ${label} left`}
        onClick={() => viewport.current?.scrollBy({ left: -192 })}
      >
        PREV
      </button>
      <button
        className="key"
        aria-label={`Scroll ${label} right`}
        onClick={() => viewport.current?.scrollBy({ left: 192 })}
      >
        NEXT
      </button>
      <button
        className="key"
        aria-label={`Scroll ${label} up`}
        onClick={() => viewport.current?.scrollBy({ top: -132 })}
      >
        UP
      </button>
      <button
        className="key"
        aria-label={`Scroll ${label} down`}
        onClick={() => viewport.current?.scrollBy({ top: 132 })}
      >
        DOWN
      </button>
    </div>
  );
}

interface NoteGesture {
  id: string;
  kind: "move" | "resize";
  note: PatternNote;
  x: number;
  y: number;
}
export function PatternPage(p: ConsoleProps) {
  const pattern = p.state.patterns[p.state.selectedPattern];
  const [selected, setSelected] = useState<string | null>(null);
  const gesture = useRef<NoteGesture | null>(null);
  const audition = useRef<string | null>(null);
  const actionRef = useRef(p.actions);
  actionRef.current = p.actions;
  const endRef = useRef(p.endGesture);
  endRef.current = p.endGesture;
  const svg = useRef<SVGSVGElement | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const note = pattern.notes.find((n) => n.id === selected);
  const beatWidth = 48,
    labelWidth = 88,
    header = 26,
    rowHeight = 22;
  const width = Math.max(756, labelWidth + pattern.length * beatWidth + 8),
    height = header + 32 * rowHeight;
  useEffect(() => {
    setSelected(null);
  }, [pattern.id]);
  useEffect(
    () => () => {
      if (audition.current) actionRef.current.padOff(audition.current);
      if (gesture.current) {
        gesture.current = null;
        endRef.current();
      }
    },
    [],
  );
  const remove = () => {
    if (!selected) return;
    p.change((s) => {
      const target = s.patterns[s.selectedPattern];
      target.notes = target.notes.filter((n) => n.id !== selected);
    });
    setSelected(null);
  };
  const editNote = (edit: (n: PatternNote) => void) => {
    if (!selected) return;
    p.change((s) => {
      const n = s.patterns[s.selectedPattern].notes.find(
        (n) => n.id === selected,
      );
      if (n) edit(n);
    });
  };
  const position = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * width) / rect.width,
      y: ((e.clientY - rect.top) * height) / rect.height,
    };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || p.busy) return;
    const point = position(e);
    svg.current?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (point.y < header) {
      p.studio.seek(
        clamp((point.x - labelWidth) / beatWidth, 0, pattern.length),
      );
      return;
    }
    const row = Math.floor((point.y - header) / rowHeight);
    if (row < 0 || row >= 32) return;
    if (point.x < labelWidth) {
      audition.current = p.actions.padOn(row);
      return;
    }
    const id = (e.target as SVGElement)
      .closest("[data-note-id]")
      ?.getAttribute("data-note-id");
    const hit = pattern.notes.find((n) => n.id === id);
    if (hit) {
      if (e.shiftKey) {
        p.change((s) => {
          s.patterns[s.selectedPattern].notes = s.patterns[
            s.selectedPattern
          ].notes.filter((n) => n.id !== hit.id);
        });
        setSelected(null);
        return;
      }
      const copy = e.altKey;
      const target = copy ? { ...hit, id: uid() } : { ...hit };
      p.beginGesture();
      if (copy)
        p.change((s) => {
          s.patterns[s.selectedPattern].notes.push(target);
        });
      setSelected(target.id);
      gesture.current = {
        id: target.id,
        kind:
          !copy &&
          point.x >= labelWidth + (hit.beat + hit.duration) * beatWidth - 7
            ? "resize"
            : "move",
        note: target,
        x: point.x,
        y: point.y,
      };
      return;
    }
    const beat = quantize(
      (point.x - labelWidth) / beatWidth,
      p.state.recordQuantize,
    );
    if (beat < 0 || beat >= pattern.length) {
      setSelected(null);
      return;
    }
    const newNote: PatternNote = {
      id: uid(),
      pad: row,
      beat,
      duration: Math.min(pattern.length - beat, p.state.recordQuantize || 0.25),
      velocity: 0.85,
      pitch: 0,
    };
    p.beginGesture();
    p.change((s) => {
      s.patterns[s.selectedPattern].notes.push(newNote);
    });
    setSelected(newNote.id);
    gesture.current = {
      id: newNote.id,
      kind: "resize",
      note: newNote,
      x: labelWidth + (newNote.beat + newNote.duration) * beatWidth,
      y: point.y,
    };
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const point = position(e);
    const delta = quantize((point.x - g.x) / beatWidth, p.state.recordQuantize),
      minimum = p.state.recordQuantize || 0.0625;
    p.change((s) => {
      const current = s.patterns[s.selectedPattern].notes.find(
        (n) => n.id === g.id,
      );
      if (!current) return;
      if (g.kind === "resize")
        current.duration = clamp(
          quantize(g.note.duration + delta, p.state.recordQuantize),
          Math.min(minimum, pattern.length - g.note.beat),
          pattern.length - g.note.beat,
        );
      else {
        current.beat = clamp(
          g.note.beat + delta,
          0,
          Math.max(0, pattern.length - g.note.duration),
        );
        current.pad = clamp(
          g.note.pad + Math.round((point.y - g.y) / rowHeight),
          0,
          31,
        );
      }
    });
  };
  const up = () => {
    if (audition.current) {
      p.actions.padOff(audition.current);
      audition.current = null;
    }
    if (gesture.current) {
      gesture.current = null;
      p.endGesture();
    }
  };
  const beats = Array.from(
    {
      length: Math.ceil(pattern.length / (p.state.recordQuantize || 0.25)) + 1,
    },
    (_, i) => i * (p.state.recordQuantize || 0.25),
  );
  return (
    <div className="editor-layout pattern-page">
      <PatternLibrary {...p} />
      <div className="editor-main">
        <section className="panel editor-panel">
          <h2 className="panel-title">EVENT SEQUENCER</h2>
          <div className="editor-toolbar">
            <TrackChoice {...p} />
            <label className="field">
              PATTERN LENGTH
              <select
                aria-label="Pattern length"
                value={pattern.length}
                onChange={(e) => {
                  const length = Number(e.target.value);
                  p.change((s) => {
                    const target = s.patterns[s.selectedPattern];
                    target.length = length;
                    target.notes = target.notes
                      .filter((n) => n.beat < length)
                      .map((n) => ({
                        ...n,
                        duration: Math.min(n.duration, length - n.beat),
                      }));
                  });
                }}
              >
                {[4, 8, 16, 32, 64, 128].map((length) => (
                  <option key={length} value={length}>
                    {length / 4} {length === 4 ? "BAR" : "BARS"}
                  </option>
                ))}
              </select>
            </label>
            <TimingChoice {...p} />
          </div>
          <EditorScrollControls viewport={viewport} label="note editor" />
          <div
            ref={viewport}
            className="timeline-scroll lcd"
            aria-label="Pattern note editor"
          >
            <svg
              ref={svg}
              className="note-grid"
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              style={{ touchAction: "none", userSelect: "none" }}
              role="application"
              tabIndex={0}
              aria-label="Pattern grid: click to draw, drag notes to move, drag their right edge to resize, Alt-drag to copy, Shift-click to delete"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onLostPointerCapture={up}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  remove();
                }
              }}
            >
              <rect width={width} height={height} fill="#a9b783" />
              {Array.from({ length: 32 }, (_, i) => (
                <g key={i}>
                  <rect
                    x={labelWidth}
                    y={header + i * rowHeight}
                    width={width - labelWidth}
                    height={rowHeight}
                    fill={i % 4 === 0 ? "#a3b07b" : "#acb987"}
                  />
                  <line
                    x1={0}
                    y1={header + (i + 1) * rowHeight}
                    x2={width}
                    y2={header + (i + 1) * rowHeight}
                    stroke="#68784a"
                    strokeOpacity=".3"
                  />
                  <text
                    x="8"
                    y={header + i * rowHeight + 15}
                    fill="#263920"
                    fontSize="10"
                  >
                    PAD {padding(i)}
                  </text>
                </g>
              ))}
              {beats.map((beat) => (
                <line
                  key={beat}
                  x1={labelWidth + beat * beatWidth}
                  x2={labelWidth + beat * beatWidth}
                  y1="0"
                  y2={height}
                  stroke="#52613d"
                  strokeOpacity={
                    beat % 4 === 0 ? 0.5 : beat % 1 === 0 ? 0.3 : 0.14
                  }
                />
              ))}
              {Array.from({ length: Math.ceil(pattern.length / 4) }, (_, i) => (
                <text
                  key={i}
                  x={labelWidth + i * 4 * beatWidth + 5}
                  y="16"
                  fill="#263920"
                  fontSize="11"
                >
                  {i + 1}
                </text>
              ))}
              <line
                x1={labelWidth}
                x2={labelWidth}
                y1="0"
                y2={height}
                stroke="#59683c"
                strokeWidth="2"
              />
              {pattern.notes.map((n) => (
                <g key={n.id} data-note-id={n.id}>
                  <rect
                    x={labelWidth + n.beat * beatWidth + 1}
                    y={header + n.pad * rowHeight + 4}
                    width={Math.max(6, n.duration * beatWidth - 2)}
                    height={rowHeight - 7}
                    rx="2"
                    fill={n.id === selected ? "#d8953d" : "#465c36"}
                    stroke={n.id === selected ? "#755322" : "#2d4426"}
                    strokeWidth="1"
                  />
                  <rect
                    x={labelWidth + n.beat * beatWidth + 3}
                    y={header + n.pad * rowHeight + rowHeight - 6}
                    width={Math.max(2, n.duration * beatWidth - 6) * n.velocity}
                    height="2"
                    fill="#c2d29b"
                  />
                </g>
              ))}
              {p.runtime.playing && p.runtime.mode === "pattern" && (
                <line
                  x1={
                    labelWidth + (p.runtime.beat % pattern.length) * beatWidth
                  }
                  x2={
                    labelWidth + (p.runtime.beat % pattern.length) * beatWidth
                  }
                  y1="0"
                  y2={height}
                  stroke="#a7422e"
                  strokeWidth="2"
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>
        </section>
        <section className="panel print-panel">
          <h2 className="panel-title">PRINT / RESAMPLE</h2>
          <div className="print-actions">
            <button
              className="key"
              disabled={p.busy || pattern.notes.length === 0}
              onClick={p.actions.bouncePattern}
            >
              BOUNCE PATTERN
            </button>
            <p>
              Print this pattern to an audio loop.
              <br />
              REC MIX captures the live master output.
            </p>
          </div>
        </section>
      </div>
      <aside className="panel inspector">
        <h2 className="panel-title">EVENT PARAMETERS</h2>
        <p className="inspector-caption">
          P{padding(p.state.selectedPattern)} {pattern.name}
        </p>
        <Knob
          label="LENGTH"
          value={note?.duration ?? 0.25}
          min={0.0625}
          max={note ? pattern.length - note.beat : pattern.length}
          step={0.0625}
          unit=" beat"
          disabled={!note || p.busy}
          onChange={(value) =>
            editNote((n) => {
              n.duration = clamp(value, 0.0625, pattern.length - n.beat);
            })
          }
          begin={p.beginGesture}
          end={p.endGesture}
        />
        <Knob
          label="VELOCITY"
          value={note?.velocity ?? 0.85}
          min={0.01}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          disabled={!note || p.busy}
          onChange={(value) =>
            editNote((n) => {
              n.velocity = value;
            })
          }
          begin={p.beginGesture}
          end={p.endGesture}
        />
        <Knob
          label="TUNE"
          value={note?.pitch ?? 0}
          min={-48}
          max={48}
          step={1}
          unit=" st"
          disabled={!note || p.busy}
          onChange={(value) =>
            editNote((n) => {
              n.pitch = value;
            })
          }
          begin={p.beginGesture}
          end={p.endGesture}
        />
        <button className="key" disabled={!note || p.busy} onClick={remove}>
          DELETE NOTE
        </button>
        <button
          className="key"
          disabled={pattern.notes.length === 0 || p.busy}
          onClick={() => {
            p.change((s) => {
              s.patterns[s.selectedPattern].notes = [];
            });
            setSelected(null);
          }}
        >
          CLEAR PATTERN
        </button>
        <p className="editor-help">
          DRAW OR SELECT AN EVENT
          <br />
          <br />
          Click grid: draw / drag: move
          <br />
          <br />
          Edge: length / Alt-drag: copy
          <br />
          <br />
          Shift-click: erase / pad: audition
        </p>
      </aside>
    </div>
  );
}

interface ClipGesture {
  id: string;
  kind: "move" | "resize";
  clip: Clip;
  x: number;
  y: number;
}
function contentLength(
  s: SessionState,
  clip: { kind: "pattern" | "audio"; contentId: string },
) {
  return clip.kind === "pattern"
    ? (s.patterns.find((n) => n.id === clip.contentId)?.length ?? 16)
    : (s.assets.find((a) => a.assetId === clip.contentId)?.lengthBeats ?? 16);
}
function downloadAudio(buffer: AudioBuffer, name: string) {
  const channels = buffer.numberOfChannels,
    frames = buffer.length,
    bytes = new ArrayBuffer(44 + frames * channels * 2),
    view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  const pcm = Array.from({ length: channels }, (_, i) =>
    buffer.getChannelData(i),
  );
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < channels; c++) {
      const x = clamp(pcm[c][f], -1, 1);
      view.setInt16(
        44 + (f * channels + c) * 2,
        Math.round(x * (x < 0 ? 32768 : 32767)),
        true,
      );
    }
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[^\w .-]/g, "_") + ".wav";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SongPage(p: ConsoleProps) {
  const [selected, setSelected] = useState<string | null>(null),
    [content, setContent] = useState(
      `pattern:${p.state.patterns[p.state.selectedPattern].id}`,
    ),
    [assetError, setAssetError] = useState("");
  const gesture = useRef<ClipGesture | null>(null),
    svg = useRef<SVGSVGElement | null>(null),
    replacement = useRef<HTMLInputElement | null>(null),
    viewport = useRef<HTMLDivElement | null>(null);
  const endRef = useRef(p.endGesture);
  endRef.current = p.endGesture;
  useEffect(
    () => () => {
      if (gesture.current) {
        gesture.current = null;
        endRef.current();
      }
    },
    [],
  );
  const clip = p.state.clips.find((c) => c.id === selected);
  const contentKind = content.startsWith("audio:") ? "audio" : "pattern";
  const contentId = content.slice(content.indexOf(":") + 1);
  const asset = p.state.assets.find((a) => a.assetId === contentId);
  const lastPattern = useRef(p.state.selectedPattern);
  useEffect(() => {
    if (
      lastPattern.current !== p.state.selectedPattern &&
      content.startsWith("pattern:")
    )
      setContent(`pattern:${p.state.patterns[p.state.selectedPattern].id}`);
    lastPattern.current = p.state.selectedPattern;
  }, [p.state.selectedPattern, p.state.patterns, content]);
  const beatWidth = 24,
    labelWidth = 112,
    header = 26,
    rowHeight = 58;
  const length = Math.max(
    64,
    p.state.loopEnd,
    ...p.state.clips.map((c) => c.beat + c.length + 8),
  );
  const width = labelWidth + Math.ceil(length / 4) * 4 * beatWidth,
    height = header + 8 * rowHeight;
  const place = (track = p.state.selectedTrack, beat = p.runtime.beat) => {
    if (contentKind === "audio" && !asset) return;
    const target: Clip = {
      id: uid(),
      track,
      kind: contentKind,
      contentId,
      beat: Math.max(0, quantize(beat, p.state.recordQuantize)),
      length: contentLength(p.state, { kind: contentKind, contentId }),
      offset: 0,
      loop: contentKind === "pattern",
      gain: 1,
    };
    p.change((s) => {
      s.clips.push(target);
    });
    setSelected(target.id);
  };
  const editClip = (edit: (c: Clip) => void) => {
    if (!selected) return;
    p.change((s) => {
      const target = s.clips.find((c) => c.id === selected);
      if (target) edit(target);
    });
  };
  const remove = () => {
    if (!selected) return;
    p.change((s) => {
      s.clips = s.clips.filter((c) => c.id !== selected);
    });
    setSelected(null);
  };
  const position = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * width) / r.width,
      y: ((e.clientY - r.top) * height) / r.height,
    };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || p.busy) return;
    const point = position(e);
    svg.current?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (point.y < header) {
      p.studio.seek(Math.max(0, (point.x - labelWidth) / beatWidth));
      return;
    }
    const track = Math.floor((point.y - header) / rowHeight);
    if (track < 0 || track > 7) return;
    if (point.x < labelWidth) {
      p.change((s) => {
        s.selectedTrack = track;
      }, false);
      return;
    }
    const id = (e.target as SVGElement)
        .closest("[data-clip-id]")
        ?.getAttribute("data-clip-id"),
      hit = p.state.clips.find((c) => c.id === id);
    if (hit) {
      if (e.shiftKey) {
        p.change((s) => {
          s.clips = s.clips.filter((c) => c.id !== hit.id);
        });
        setSelected(null);
        return;
      }
      const copy = e.altKey,
        target = copy ? { ...hit, id: uid() } : { ...hit };
      p.beginGesture();
      if (copy)
        p.change((s) => {
          s.clips.push(target);
        });
      setSelected(target.id);
      gesture.current = {
        id: target.id,
        kind:
          !copy &&
          point.x >= labelWidth + (hit.beat + hit.length) * beatWidth - 8
            ? "resize"
            : "move",
        clip: target,
        x: point.x,
        y: point.y,
      };
      return;
    }
    setSelected(null);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const point = position(e),
      delta = quantize((point.x - g.x) / beatWidth, p.state.recordQuantize);
    p.change((s) => {
      const target = s.clips.find((c) => c.id === g.id);
      if (!target) return;
      if (g.kind === "resize") {
        const limit = g.clip.loop
          ? 1024
          : Math.max(0.0625, contentLength(s, g.clip) - g.clip.offset);
        target.length = clamp(
          quantize(g.clip.length + delta, p.state.recordQuantize),
          p.state.recordQuantize || 0.0625,
          limit,
        );
      } else {
        target.beat = Math.max(0, g.clip.beat + delta);
        target.track = clamp(
          g.clip.track + Math.round((point.y - g.y) / rowHeight),
          0,
          7,
        );
      }
    });
  };
  const up = () => {
    if (gesture.current) {
      gesture.current = null;
      p.endGesture();
    }
  };
  const sourceBpm = (value: number) => {
    if (!asset || !Number.isFinite(value) || value < 20 || value > 999) return;
    p.change((s) => {
      const current = s.assets.find((a) => a.assetId === asset.assetId);
      if (!current) return;
      const beats = (current.duration * value) / 60,
        scale = beats / current.lengthBeats;
      current.sourceBpm = value;
      current.bpm = value;
      current.lengthBeats = beats;
      for (const c of s.clips)
        if (c.kind === "audio" && c.contentId === current.assetId) {
          c.offset *= scale;
          if (!c.loop)
            c.length = Math.max(0.0625, Math.min(c.length, beats - c.offset));
        }
    });
  };
  const replaceAsset = async (file: File | undefined) => {
    if (!file || !asset) return;
    setAssetError("");
    try {
      const info = await p.engine.loadAsset(file, asset.sourceBpm),
        buffer = p.engine.getBuffer(info.assetId);
      if (!buffer)
        throw new Error("The replacement file could not be decoded.");
      const restored: AssetInfo = { ...info, assetId: asset.assetId };
      p.engine.installBuffer(restored, buffer);
      p.change((s) => {
        s.assets = s.assets.map((a) =>
          a.assetId === asset.assetId ? restored : a,
        );
        for (const c of s.clips)
          if (c.kind === "audio" && c.contentId === asset.assetId && !c.loop)
            c.length = Math.max(
              0.0625,
              Math.min(c.length, restored.lengthBeats - c.offset),
            );
      });
    } catch (error) {
      setAssetError(
        error instanceof Error ? error.message : "Could not replace audio.",
      );
    }
  };
  return (
    <div className="editor-layout song-page">
      <PatternLibrary {...p} />
      <div className="editor-main">
        <section className="panel clip-cartridge">
          <h2 className="panel-title">CLIP CARTRIDGE / PLACE AT PLAYHEAD</h2>
          <div className="editor-toolbar">
            <select
              aria-label="Clip content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            >
              <optgroup label="PATTERNS">
                {p.state.patterns.map((pattern, i) => (
                  <option key={pattern.id} value={`pattern:${pattern.id}`}>
                    P{padding(i)} {pattern.name}
                  </option>
                ))}
              </optgroup>
              {p.state.assets.length > 0 && (
                <optgroup label="AUDIO LOOPS">
                  {p.state.assets.map((a) => (
                    <option key={a.assetId} value={`audio:${a.assetId}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button className="key" disabled={p.busy} onClick={() => place()}>
              + PLACE CLIP
            </button>
          </div>
        </section>
        <section className="panel editor-panel song-editor-panel">
          <h2 className="panel-title">SONG TIMELINE / EIGHT TRACKS</h2>
          <EditorScrollControls viewport={viewport} label="song editor" />
          <div
            ref={viewport}
            className="timeline-scroll lcd"
            aria-label="Arrangement editor"
          >
            <svg
              ref={svg}
              className="song-grid"
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              style={{ touchAction: "none", userSelect: "none" }}
              tabIndex={0}
              role="application"
              aria-label="Song timeline: double-click to place, drag to move, edge to resize, Alt-drag to copy, header to seek"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onLostPointerCapture={up}
              onDoubleClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect(),
                  x = ((e.clientX - r.left) * width) / r.width,
                  y = ((e.clientY - r.top) * height) / r.height;
                if (
                  !(e.target as SVGElement).closest("[data-clip-id]") &&
                  x >= labelWidth &&
                  y >= header
                )
                  place(
                    clamp(Math.floor((y - header) / rowHeight), 0, 7),
                    (x - labelWidth) / beatWidth,
                  );
              }}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  remove();
                }
              }}
            >
              <defs>
                {p.state.clips.map((c) => (
                  <clipPath key={c.id} id={`clip-${c.id}`}>
                    <rect
                      x={labelWidth + c.beat * beatWidth + 5}
                      y={header + c.track * rowHeight}
                      width={Math.max(0, c.length * beatWidth - 10)}
                      height={rowHeight}
                    />
                  </clipPath>
                ))}
              </defs>
              <rect width={width} height={height} fill="#a9b783" />
              {p.state.tracks.map((track, i) => (
                <g key={track.id}>
                  <rect
                    x={labelWidth}
                    y={header + i * rowHeight}
                    width={width - labelWidth}
                    height={rowHeight}
                    fill={i % 2 ? "#a5b27e" : "#adb98a"}
                  />
                  <text
                    x="9"
                    y={header + i * rowHeight + 31}
                    fill="#263920"
                    fontSize="10"
                  >
                    {padding(i)} {track.name}
                  </text>
                  <line
                    x1="0"
                    x2={width}
                    y1={header + (i + 1) * rowHeight}
                    y2={header + (i + 1) * rowHeight}
                    stroke="#647548"
                    strokeOpacity=".4"
                  />
                </g>
              ))}
              {Array.from(
                {
                  length:
                    Math.ceil(length / Math.max(1, Math.ceil(length / 2048))) +
                    1,
                },
                (_, i) => (
                  <line
                    key={i}
                    x1={
                      labelWidth +
                      i * Math.max(1, Math.ceil(length / 2048)) * beatWidth
                    }
                    x2={
                      labelWidth +
                      i * Math.max(1, Math.ceil(length / 2048)) * beatWidth
                    }
                    y1="0"
                    y2={height}
                    stroke="#52613d"
                    strokeOpacity={i % 4 === 0 ? 0.5 : 0.15}
                  />
                ),
              )}
              {Array.from(
                {
                  length: Math.ceil(
                    length / (4 * Math.max(1, Math.ceil(length / 2048))),
                  ),
                },
                (_, i) => (
                  <text
                    key={i}
                    x={
                      labelWidth +
                      i *
                        4 *
                        Math.max(1, Math.ceil(length / 2048)) *
                        beatWidth +
                      5
                    }
                    y="17"
                    fill="#263920"
                    fontSize="10"
                  >
                    {i * Math.max(1, Math.ceil(length / 2048)) + 1}
                  </text>
                ),
              )}
              {p.state.clips.map((c) => {
                const label =
                  c.kind === "pattern"
                    ? `P${padding(p.state.patterns.findIndex((n) => n.id === c.contentId))} ${p.state.patterns.find((n) => n.id === c.contentId)?.name ?? "Missing pattern"}`
                    : (p.state.assets.find((a) => a.assetId === c.contentId)
                        ?.name ?? "Missing audio");
                return (
                  <g key={c.id} data-clip-id={c.id}>
                    <rect
                      x={labelWidth + c.beat * beatWidth + 1}
                      y={header + c.track * rowHeight + 2}
                      width={Math.max(6, c.length * beatWidth - 2)}
                      height={rowHeight - 4}
                      rx="2"
                      fill={cueColours[c.track]}
                      fillOpacity=".68"
                      stroke={c.id === selected ? "#f0c46d" : "#6d7756"}
                      strokeWidth={c.id === selected ? 3 : 1}
                    />
                    <text
                      x={labelWidth + c.beat * beatWidth + 7}
                      y={header + c.track * rowHeight + 32}
                      fill="#25341f"
                      fontSize="10"
                      clipPath={`url(#clip-${c.id})`}
                    >
                      {label}
                    </text>
                    <line
                      x1={labelWidth + (c.beat + c.length) * beatWidth - 5}
                      x2={labelWidth + (c.beat + c.length) * beatWidth - 5}
                      y1={header + c.track * rowHeight + 6}
                      y2={header + (c.track + 1) * rowHeight - 6}
                      stroke="#53643a"
                      strokeOpacity=".6"
                    />
                  </g>
                );
              })}
              <line
                x1={labelWidth + p.runtime.beat * beatWidth}
                x2={labelWidth + p.runtime.beat * beatWidth}
                y1="0"
                y2={height}
                stroke="#a7422e"
                strokeWidth="2"
                pointerEvents="none"
              />
            </svg>
          </div>
        </section>
        <section className="panel song-tools">
          <div className="editor-toolbar">
            <TrackChoice {...p} />
            <button
              className="key"
              onClick={p.actions.importAsset}
              disabled={p.busy}
            >
              IMPORT AUDIO
            </button>
            <details className="asset-actions">
              <summary className="key" aria-disabled={!asset}>
                AUDIO FILE…
              </summary>
              {asset ? (
                <div className="asset-actions-menu">
                  <strong>{asset.name}</strong>
                  <label className="field">
                    SOURCE BPM
                    <input
                      type="number"
                      min="20"
                      max="999"
                      step=".1"
                      value={asset.sourceBpm}
                      aria-label="Audio source BPM"
                      onChange={(e) => sourceBpm(Number(e.target.value))}
                    />
                  </label>
                  <button
                    className="key"
                    onClick={() => replacement.current?.click()}
                  >
                    LOCATE / REPLACE…
                  </button>
                  <button
                    className="key"
                    onClick={() => {
                      const b = p.engine.getBuffer(asset.assetId);
                      if (b) downloadAudio(b, asset.name);
                    }}
                  >
                    DOWNLOAD AUDIO
                  </button>
                  <button
                    className="key"
                    onClick={() => {
                      p.change((s) => {
                        s.assets = s.assets.filter(
                          (a) => a.assetId !== asset.assetId,
                        );
                        s.clips = s.clips.filter(
                          (c) =>
                            c.kind !== "audio" || c.contentId !== asset.assetId,
                        );
                        for (const row of s.launchSlots)
                          for (let i = 0; i < row.length; i++)
                            if (
                              row[i]?.kind === "audio" &&
                              row[i]?.contentId === asset.assetId
                            )
                              row[i] = null;
                      });
                      setContent(
                        `pattern:${p.state.patterns[p.state.selectedPattern].id}`,
                      );
                    }}
                  >
                    REMOVE ASSET + CLIPS
                  </button>
                </div>
              ) : (
                <div className="asset-actions-menu">
                  Select an imported audio loop.
                </div>
              )}
            </details>
            <input
              ref={replacement}
              type="file"
              accept="audio/*,.wav,.aif,.aiff,.flac,.mp3"
              hidden
              onChange={(e) => {
                void replaceAsset(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>
          <div className="editor-toolbar loop-toolbar">
            <button
              className={`key ${p.state.loop ? "is-active" : ""}`}
              aria-pressed={p.state.loop}
              onClick={() =>
                p.change((s) => {
                  s.loop = !s.loop;
                })
              }
            >
              LOOP
            </button>
            <label className="field">
              LOOP IN
              <input
                type="number"
                min="0"
                max={Math.max(0, p.state.loopEnd - 0.25)}
                step=".25"
                aria-label="Arrangement loop start"
                value={p.state.loopStart}
                onChange={(e) =>
                  p.change((s) => {
                    s.loopStart = clamp(
                      Number(e.target.value),
                      0,
                      s.loopEnd - 0.25,
                    );
                  })
                }
              />
            </label>
            <label className="field">
              LOOP OUT
              <input
                type="number"
                min={p.state.loopStart + 0.25}
                step=".25"
                max="4096"
                aria-label="Arrangement loop end"
                value={p.state.loopEnd}
                onChange={(e) =>
                  p.change((s) => {
                    s.loopEnd = Math.min(
                      4096,
                      Math.max(s.loopStart + 0.25, Number(e.target.value)),
                    );
                  })
                }
              />
            </label>
            <button
              className="key"
              onClick={p.actions.bouncePattern}
              disabled={
                p.busy ||
                p.state.patterns[p.state.selectedPattern].notes.length === 0
              }
            >
              BOUNCE PATTERN
            </button>
          </div>
          {assetError && (
            <p role="alert" className="editor-error">
              {assetError}
            </p>
          )}
        </section>
      </div>
      <aside className="panel inspector">
        <h2 className="panel-title">CLIP PARAMETERS</h2>
        <Knob
          label="CLIP LENGTH"
          value={clip?.length ?? 16}
          min={0.0625}
          max={
            clip && !clip.loop
              ? Math.max(0.0625, contentLength(p.state, clip) - clip.offset)
              : 256
          }
          step={0.0625}
          unit=" beat"
          disabled={!clip || p.busy}
          onChange={(value) =>
            editClip((c) => {
              c.length = value;
            })
          }
          begin={p.beginGesture}
          end={p.endGesture}
        />
        <Knob
          label="CLIP GAIN"
          value={clip?.gain ?? 1}
          min={0}
          max={2}
          step={0.01}
          format={(v) =>
            v === 0 ? "−∞ dB" : `${number(20 * Math.log10(v), 1)} dB`
          }
          disabled={!clip || p.busy}
          onChange={(value) =>
            editClip((c) => {
              c.gain = value;
            })
          }
          begin={p.beginGesture}
          end={p.endGesture}
        />
        <label className="field">
          SOURCE OFFSET
          <input
            type="number"
            min="0"
            step=".25"
            disabled={!clip || p.busy}
            aria-label="Clip source offset"
            value={clip?.offset ?? 0}
            onChange={(e) =>
              editClip((c) => {
                c.offset = clamp(
                  Number(e.target.value),
                  0,
                  Math.max(0, contentLength(p.state, c) - 0.0625),
                );
                if (!c.loop)
                  c.length = Math.min(
                    c.length,
                    contentLength(p.state, c) - c.offset,
                  );
              })
            }
          />
        </label>
        <button
          className={`key ${clip?.loop ? "is-active" : ""}`}
          disabled={!clip || p.busy}
          aria-pressed={clip?.loop ?? false}
          onClick={() =>
            editClip((c) => {
              c.loop = !c.loop;
              if (!c.loop)
                c.length = Math.min(
                  c.length,
                  Math.max(0.0625, contentLength(p.state, c) - c.offset),
                );
            })
          }
        >
          CLIP LOOP
        </button>
        <button className="key" disabled={!clip || p.busy} onClick={remove}>
          DELETE CLIP
        </button>
        <p className="editor-help">
          Double-click: place clip
          <br />
          <br />
          Drag: move / edge: trim
          <br />
          <br />
          Alt-drag: duplicate clip
          <br />
          <br />
          Click timeline header: seek
        </p>
      </aside>
    </div>
  );
}
