import { useRef, useState } from "react";
import {
  Copy,
  ArrowLeft,
  Heart,
  Settings2,
  Trash2,
  Undo2,
  Redo2,
  Keyboard,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ConsoleProps } from "../ui-contracts";
import type { Cue, SampleModule, SessionState, StemMask } from "../model";
import { blankCue, cloneSession } from "../model";
import { Field, Key, Knob, Panel, Readout, Select } from "./Controls";
import { Waveform } from "./Waveform";
const typing = "AWSEDFTGYHUJKOLP";
const moduleNames: SampleModule[] = [
  "trim",
  "tune",
  "envelope",
  "stems",
  "grid",
];
const timeText = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
export function SamplerPage(p: ConsoleProps) {
  const [autoMode, setAutoMode] = useState<
      "find" | "slicer" | "random" | "keyshift" | "serato"
    >("find"),
    [size, setSize] = useState(1),
    [menu, setMenu] = useState<{ pad: number; x: number; y: number } | null>(
      null,
    ),
    [destination, setDestination] = useState(0),
    [rename, setRename] = useState<{ pad: number; name: string } | null>(null);
  const pointerTokens = useRef(new Map<number, string>());
  const gridBackup = useRef<SessionState | null>(null),
    [gridDirty, setGridDirty] = useState(false);
  const loaded = !!p.state.source,
    selected = p.view.selection.filter((i) => !p.state.cues[i].empty),
    cue = p.state.cues[p.view.selection[0] ?? 0],
    hasSelection = selected.length > 0;
  const edit = (fn: (c: Cue) => void) =>
    p.change((s) => {
      for (const i of selected) fn(s.cues[i]);
    });
  const common = (
    key: "gainDb" | "filter" | "attackMs" | "releaseMs" | "pitch" | "speed",
    fallback: number,
  ) =>
    selected.length &&
    selected.every(
      (i) => p.state.cues[i][key] === p.state.cues[selected[0]][key],
    )
      ? p.state.cues[selected[0]][key]
      : fallback;
  const knobProps = {
    begin: p.beginGesture,
    end: p.endGesture,
    disabled: !hasSelection || p.busy,
  };
  const setModule = (module: SampleModule) => {
    if (
      p.view.module === "grid" &&
      module !== "grid" &&
      gridDirty &&
      gridBackup.current
    ) {
      const backup = gridBackup.current;
      p.change((s) => {
        s.sourceBpm = backup.sourceBpm;
        s.tempoMarkers = backup.tempoMarkers;
        s.beatgrid = backup.beatgrid;
      });
      setGridDirty(false);
    }
    if (module === "grid" && p.view.module !== "grid")
      gridBackup.current = cloneSession(p.state);
    p.setView({ module, options: false });
  };
  const gridEdit = (fn: (s: SessionState) => void) => {
    setGridDirty(true);
    p.change(fn);
  };
  const move = (from: number, to: number, copy: boolean) => {
    p.change((s) => {
      const a = structuredClone(s.cues[from]),
        b = structuredClone(s.cues[to]);
      s.cues[to] = { ...a, id: to };
      if (!copy) s.cues[from] = { ...b, id: from };
    });
    p.setView({ bank: to >= 16 ? 1 : 0, selection: [to] });
    setMenu(null);
  };
  const deleteSelected = () =>
    p.change((s) => {
      for (const i of p.view.selection) s.cues[i] = blankCue(i);
    });
  const mutateStem = (index: number, solo: boolean) => {
    const mutate = (mask: StemMask) => {
      if (solo) for (let i = 0; i < 4; i++) mask[i] = i !== index;
      else mask[index] = !mask[index];
    };
    p.change((s) => {
      if (selected.length) {
        for (const i of selected) mutate(s.cues[i].stemMute);
      } else mutate(s.stemMute);
    });
  };
  const offBank = p.view.selection.filter(
    (i) => Math.floor(i / 16) !== p.view.bank,
  ).length;
  const occupied = p.state.cues.filter((c) => !c.empty).map((c) => c.id);
  return (
    <div className="sample-workspace">
      <Panel
        title="PERFORMANCE PADS"
        className="performance-pads"
        actions={
          <small>
            {p.view.bank ? "17 – 32" : "01 – 16"}
            {offBank ? ` / ${offBank} SELECTED OFF BANK` : ""}
          </small>
        }
      >
        <div className="bank-toolbar">
          <Key
            active={p.view.bank === 0}
            onClick={() => p.setView({ bank: 0 })}
            onDragEnter={() => p.setView({ bank: 0 })}
          >
            BANK A
          </Key>
          <Key
            active={p.view.bank === 1}
            onClick={() => p.setView({ bank: 1 })}
            onDragEnter={() => p.setView({ bank: 1 })}
          >
            BANK B
          </Key>
          <div className="bank-tools">
            <Key
              disabled={!occupied.length}
              onClick={() => p.setView({ selection: occupied })}
            >
              Select All
            </Key>
            <Key
              aria-label="Delete selected cues"
              disabled={!hasSelection}
              onClick={deleteSelected}
            >
              <Trash2 size={15} />
            </Key>
            <Key
              aria-label="Undo sample edit"
              disabled={!p.actions.canUndo}
              onClick={p.actions.undo}
            >
              <Undo2 size={16} />
            </Key>
            <Key
              aria-label="Redo sample edit"
              disabled={!p.actions.canRedo}
              onClick={p.actions.redo}
            >
              <Redo2 size={16} />
            </Key>
          </div>
        </div>
        <div className="pad-grid">
          {[12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map(
            (local) => {
              const index = local + p.view.bank * 16,
                c = p.state.cues[index],
                isSelected = p.view.selection.includes(index),
                active = p.audio.activePads.includes(index);
              return (
                <button
                  key={index}
                  type="button"
                  className={`pad ${isSelected ? "selected" : ""} ${active ? "playing" : ""} ${c.empty ? "empty" : ""}`}
                  aria-label={`Pad ${index + 1}${c.empty ? ", empty" : `, ${c.name}`}`}
                  aria-pressed={active}
                  disabled={!loaded || p.busy}
                  style={{ "--cue-colour": c.colour } as React.CSSProperties}
                  draggable={!c.empty}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const selection =
                      e.ctrlKey || e.metaKey
                        ? isSelected
                          ? p.view.selection.filter((i) => i !== index)
                          : [...p.view.selection, index]
                        : [index];
                    p.setView({ selection });
                    if (e.shiftKey) {
                      p.change((s) => {
                        s.cues[index] = blankCue(index);
                      });
                      return;
                    }
                    if (e.ctrlKey || e.metaKey) return;
                    const bounds = e.currentTarget.getBoundingClientRect(),
                      velocity = p.state.velocity
                        ? Math.max(
                            0.2,
                            1 -
                              ((e.clientY - bounds.top) / bounds.height) * 0.6,
                          )
                        : 1;
                    const token = p.actions.padOn(index, velocity);
                    pointerTokens.current.set(e.pointerId, token);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    const token = pointerTokens.current.get(e.pointerId);
                    if (token) {
                      p.actions.padOff(token);
                      pointerTokens.current.delete(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    const token = pointerTokens.current.get(e.pointerId);
                    if (token) p.actions.padOff(token);
                    pointerTokens.current.delete(e.pointerId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!e.repeat)
                        pointerTokens.current.set(
                          -index - 1,
                          p.actions.padOn(index, 1),
                        );
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      const token = pointerTokens.current.get(-index - 1);
                      if (token) p.actions.padOff(token);
                      pointerTokens.current.delete(-index - 1);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    p.setView({ selection: [index] });
                    setDestination(index);
                    setMenu({ pad: index, x: e.clientX, y: e.clientY });
                  }}
                  onDoubleClick={() => setRename({ pad: index, name: c.name })}
                  onDragStart={(e) => {
                    for (const token of pointerTokens.current.values())
                      p.actions.padOff(token);
                    pointerTokens.current.clear();
                    e.dataTransfer.setData(
                      "application/samplify-cue",
                      String(index),
                    );
                    e.dataTransfer.effectAllowed = "copyMove";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(
                      e.dataTransfer.getData("application/samplify-cue"),
                    );
                    if (
                      Number.isInteger(from) &&
                      from >= 0 &&
                      from < 32 &&
                      from !== index
                    )
                      move(from, index, e.altKey);
                  }}
                >
                  <i className="cue-line" />
                  <span className="pad-id">
                    {p.view.bank ? "B" : "A"}
                    {String(local + 1).padStart(2, "0")}
                  </span>
                  {c.favorite && (
                    <Star
                      className="pad-favorite"
                      size={13}
                      fill="currentColor"
                    />
                  )}
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                  <span className="pad-caption">
                    {c.empty ? "EMPTY" : c.name}
                  </span>
                  <span className="pad-key">{typing[local]}</span>
                </button>
              );
            },
          )}
        </div>
        <div className="autoset-controls">
          <Key
            disabled={!loaded || p.busy}
            onClick={() => p.actions.autoSet(autoMode, size)}
          >
            {autoMode === "find"
              ? "Find Samples"
              : autoMode === "slicer"
                ? "Set Slicer"
                : autoMode === "random"
                  ? "Set Random"
                  : autoMode === "keyshift"
                    ? "Key Shift Pad"
                    : "Import Serato DJ Cues"}
          </Key>
          <Select
            aria-label="Autoset mode"
            value={autoMode}
            onChange={(e) => setAutoMode(e.target.value as typeof autoMode)}
          >
            <option value="find">Find Samples</option>
            <option value="slicer">Set Slicer</option>
            <option value="random">Set Random</option>
            <option value="keyshift">Key Shift Pad</option>
            <option value="serato">Serato DJ</option>
          </Select>
        </div>
        {(autoMode === "slicer" || autoMode === "keyshift") && (
          <div className="autoset-domain">
            <Key
              aria-label="Shift slicer left"
              onClick={() => {
                p.engine.seekSource(
                  Math.max(
                    0,
                    p.audio.sourceTime - (size * 60) / p.state.sourceBpm,
                  ),
                );
                p.actions.autoSet(autoMode, size);
              }}
            >
              <ChevronLeft size={13} />
            </Key>
            <Select
              label={autoMode === "slicer" ? "Slice beats" : "Semitone step"}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {(autoMode === "slicer"
                ? [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16]
                : [1, 2, 3, 4, 5, 7, 12]
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <Key
              aria-label="Shift slicer right"
              onClick={() => {
                p.engine.seekSource(
                  Math.min(
                    p.state.source?.duration || 0,
                    p.audio.sourceTime + (size * 60) / p.state.sourceBpm,
                  ),
                );
                p.actions.autoSet(autoMode, size);
              }}
            >
              <ChevronRight size={13} />
            </Key>
          </div>
        )}
        <div className="performance-options">
          <Key
            active={p.state.hold}
            disabled={!loaded}
            onClick={() =>
              p.change((s) => {
                s.hold = !s.hold;
              })
            }
          >
            {p.state.hold ? "HOLD" : "TRIGGER"}
          </Key>
          <Key
            active={p.state.mono}
            disabled={!loaded}
            onClick={() =>
              p.change((s) => {
                s.mono = !s.mono;
              })
            }
          >
            {p.state.mono ? "MONO" : "POLY"}
          </Key>
          <Key
            title="Chromatic keyboard mode"
            aria-label="Chromatic keyboard mode"
            active={p.state.keyboard}
            disabled={!hasSelection}
            onClick={() =>
              p.change((s) => {
                s.keyboard = !s.keyboard;
              })
            }
          >
            <Keyboard size={25} />
          </Key>
          <span />
          <Key
            active={p.state.velocity}
            title="Velocity sensitivity"
            disabled={!loaded}
            onClick={() =>
              p.change((s) => {
                s.velocity = !s.velocity;
              })
            }
          >
            VEL
          </Key>
          <Key
            active={p.state.quantize}
            title="Quantize cue boundaries to 1/8 beat"
            disabled={!loaded}
            onClick={() =>
              p.change((s) => {
                s.quantize = !s.quantize;
              })
            }
          >
            QNT
          </Key>
        </div>
        <small className="typing-legend">
          A W S E / D F T G / Y H U J / K O L P
        </small>
      </Panel>
      <Panel
        title="SAMPLING DECK"
        className="sampling-deck"
        actions={
          <div className="deck-top-controls">
            <Key
              disabled={!loaded || p.busy}
              onClick={() => {
                if (p.audio.sourcePlaying) p.engine.pauseSource();
                else void p.engine.audition().catch(p.reportError);
              }}
            >
              {p.audio.sourcePlaying ? "PAUSE SOURCE" : "AUDITION"}
            </Key>
            <Key dark disabled={p.busy} onClick={p.actions.loadSource}>
              LOAD
            </Key>
          </div>
        }
      >
        <Readout className="source-lcd">
          <strong>{p.state.source?.name || "SAMPLE MEMORY"}</strong>
          {loaded && (
            <Key onClick={p.actions.eject} title="Eject source">
              Eject
            </Key>
          )}
          <small>
            {loaded
              ? `${p.state.source!.key} / ${p.state.sourceBpm.toFixed(2)} BPM / ${timeText(p.audio.sourceTime)}`
              : "WAV / AIFF / FLAC / MP3"}
          </small>
        </Readout>
        {loaded ? (
          <div className="source-waveforms">
            <Waveform p={p} overview />
            <Waveform p={p} />
          </div>
        ) : (
          <Readout className="empty-source">
            <strong>NO SAMPLE LOADED</strong>
            <span>Load an audio file to start chopping</span>
            <Key dark onClick={p.actions.loadSource}>
              LOAD AUDIO
            </Key>
            <button className="text-action" onClick={p.actions.loadDemo}>
              Try the demo break
            </button>
          </Readout>
        )}
        <div className="module-keys">
          {moduleNames.map((m) => (
            <Key
              dark
              active={p.view.module === m}
              key={m}
              onClick={() => setModule(m)}
            >
              {m.toUpperCase()}
            </Key>
          ))}
        </div>
        <div className="parameter-deck">
          <div className="cue-summary">
            {!loaded
              ? "SELECT AN AUDIO FILE TO START"
              : selected.length > 1
                ? `${selected.length} CUES SELECTED / ALL BANKS`
                : `PAD ${cue.id >= 16 ? "B" : "A"}${String((cue.id % 16) + 1).padStart(2, "0")} / ${cue.empty ? "EMPTY" : cue.name}`}
          </div>
          {p.view.module === "trim" &&
            (p.view.options ? (
              <div className="cue-options">
                <p>
                  {selected.length > 1
                    ? `${selected.length} selected cues across both banks`
                    : `Cue ${cue.id + 1} / MIDI ${cue.id + 24}`}
                </p>
                <Select
                  label="LIVE SAMPLER OUTPUT TRACK"
                  value={p.state.selectedTrack}
                  onChange={(e) =>
                    p.change((s) => {
                      s.selectedTrack = Number(e.target.value);
                    })
                  }
                >
                  {p.state.tracks.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.id + 1} / {t.name}
                    </option>
                  ))}
                </Select>
                <Key onClick={() => p.setView({ options: false })}>
                  CLOSE OPTIONS
                </Key>
                <Key onClick={p.actions.exportCue} disabled={!hasSelection}>
                  EXPORT CUE WAV
                </Key>
                <Key onClick={p.actions.exportAll} disabled={!hasSelection}>
                  EXPORT ALL CUES
                </Key>
              </div>
            ) : (
              <div className="trim-module">
                <Knob
                  label="Level"
                  value={common("gainDb", 0)}
                  min={-12}
                  max={12}
                  step={0.1}
                  unit="dB"
                  onChange={(v) =>
                    edit((c) => {
                      c.gainDb = v;
                    })
                  }
                  {...knobProps}
                />
                <Knob
                  label="Filter"
                  value={common("filter", 0.5)}
                  min={0}
                  max={1}
                  step={0.001}
                  unit=""
                  format={(v) =>
                    v === 0.5 ? "OFF" : v < 0.5 ? "LOW PASS" : "HIGH PASS"
                  }
                  onChange={(v) =>
                    edit((c) => {
                      c.filter = v;
                    })
                  }
                  {...knobProps}
                />
                <div className="module-switches">
                  <Key
                    active={cue.reverse}
                    disabled={!hasSelection}
                    onClick={() =>
                      edit((c) => {
                        c.reverse = !cue.reverse;
                      })
                    }
                  >
                    <ArrowLeft size={14} /> REVERSE
                  </Key>
                  <Key
                    active={cue.favorite}
                    disabled={!hasSelection}
                    onClick={() =>
                      edit((c) => {
                        c.favorite = !cue.favorite;
                      })
                    }
                  >
                    <Star size={14} /> FAVORITE
                  </Key>
                  <Key
                    disabled={!loaded}
                    onClick={() => p.setView({ options: true })}
                  >
                    <Settings2 size={15} /> OPTIONS
                  </Key>
                </div>
              </div>
            ))}
          {p.view.module === "tune" && (
            <div className="tune-module">
              <div>
                <Field
                  label="SOURCE TRANSPOSE"
                  type="number"
                  min={-24}
                  max={24}
                  step={1}
                  value={p.state.globalPitch}
                  disabled={!loaded}
                  onChange={(e) =>
                    p.change((s) => {
                      s.globalPitch = Number(e.target.value);
                    })
                  }
                />
                <Field
                  label="DETUNE · cents"
                  type="number"
                  min={-100}
                  max={100}
                  value={p.state.detune}
                  disabled={!loaded}
                  onChange={(e) =>
                    p.change((s) => {
                      s.detune = Number(e.target.value);
                    })
                  }
                />
                <Key
                  active={p.state.pitchTime}
                  disabled={!loaded}
                  onClick={() =>
                    p.change((s) => {
                      s.pitchTime = !s.pitchTime;
                    })
                  }
                >
                  PITCH / TIME
                </Key>
                <Field
                  label="CUE KEY SHIFT · semitones"
                  type="number"
                  min={-48}
                  max={48}
                  value={common("pitch", 0)}
                  disabled={!hasSelection}
                  onChange={(e) =>
                    edit((c) => {
                      c.pitch = Number(e.target.value);
                    })
                  }
                />
              </div>
              <div>
                <Field
                  label="CURRENT TEMPO · BPM"
                  type="number"
                  min={20}
                  max={999}
                  step={0.01}
                  value={p.state.sync ? p.state.tempo : p.state.sourceBpm}
                  disabled={!loaded || p.state.sync}
                  onChange={(e) =>
                    p.change((s) => {
                      s.sourceBpm = Math.min(
                        999,
                        Math.max(20, Number(e.target.value)),
                      );
                    })
                  }
                />
                <div className="key-row">
                  <Key
                    disabled={!loaded}
                    onClick={() =>
                      p.change((s) => {
                        s.sourceBpm = Math.max(20, s.sourceBpm / 2);
                      })
                    }
                  >
                    ½ BPM
                  </Key>
                  <Key
                    disabled={!loaded}
                    onClick={() =>
                      p.change((s) => {
                        s.sourceBpm = Math.min(999, s.sourceBpm * 2);
                      })
                    }
                  >
                    2× BPM
                  </Key>
                  <Key
                    active={p.state.sync}
                    disabled={!loaded || !p.state.pitchTime}
                    onClick={() =>
                      p.change((s) => {
                        s.sync = !s.sync;
                      })
                    }
                  >
                    SYNC
                  </Key>
                </div>
                <Field
                  label="CUE SPEED · ratio"
                  type="number"
                  min={0.125}
                  max={8}
                  step={0.01}
                  value={common("speed", 1)}
                  disabled={!hasSelection}
                  onChange={(e) =>
                    edit((c) => {
                      c.speed = Number(e.target.value);
                    })
                  }
                />
                <div className="key-row">
                  <Key
                    disabled={!hasSelection}
                    onClick={() =>
                      edit((c) => {
                        c.speed = Math.max(0.125, c.speed / 2);
                      })
                    }
                  >
                    ½ SPEED
                  </Key>
                  <Key
                    disabled={!hasSelection}
                    onClick={() =>
                      edit((c) => {
                        c.speed = Math.min(8, c.speed * 2);
                      })
                    }
                  >
                    2× SPEED
                  </Key>
                </div>
              </div>
            </div>
          )}
          {p.view.module === "envelope" && (
            <div className="envelope-module">
              <Knob
                label="Attack"
                value={common("attackMs", 0)}
                min={0}
                max={10000}
                step={1}
                unit="ms"
                onChange={(v) =>
                  edit((c) => {
                    c.attackMs = v;
                  })
                }
                {...knobProps}
              />
              <Knob
                label="Release"
                value={common("releaseMs", 10000)}
                min={1}
                max={10000}
                step={1}
                unit="ms"
                onChange={(v) =>
                  edit((c) => {
                    c.releaseMs = v;
                  })
                }
                {...knobProps}
              />
              <div>
                <Knob
                  label="Glide"
                  value={p.state.glideMs}
                  min={0}
                  max={2000}
                  step={1}
                  unit="ms"
                  disabled={!hasSelection || !p.state.keyboard || !p.state.mono}
                  begin={p.beginGesture}
                  end={p.endGesture}
                  onChange={(v) =>
                    p.change((s) => {
                      s.glideMs = v;
                    })
                  }
                />
                <Select
                  aria-label="Glide mode"
                  value={p.state.glideMode}
                  disabled={!p.state.keyboard || !p.state.mono}
                  onChange={(e) =>
                    p.change((s) => {
                      s.glideMode = e.target.value as typeof s.glideMode;
                    })
                  }
                >
                  <option value="trigger">TRIGGER</option>
                  <option value="sustain">SUSTAIN</option>
                </Select>
              </div>
            </div>
          )}
          {p.view.module === "stems" && (
            <div className="stems-module">
              <div className="stem-keys">
                {["VOCALS", "MELODY", "BASS", "DRUMS"].map((name, i) => {
                  const ready = !!p.engine.getStems()[i],
                    muted =
                      p.state.stemMute[i] ||
                      (selected.length > 0 &&
                        p.state.cues[selected[0]].stemMute[i]);
                  return (
                    <div key={name}>
                      <Key
                        dark
                        active={ready && !muted}
                        disabled={!loaded || p.busy}
                        onClick={(e) => {
                          if (!ready) p.actions.separateStems();
                          else mutateStem(i, e.shiftKey);
                        }}
                      >
                        {name}
                        <small>
                          {ready ? (muted ? "MUTED" : "ON") : "SEPARATE"}
                        </small>
                      </Key>
                      <button
                        className="text-action"
                        disabled={!loaded || p.busy}
                        onClick={() => p.actions.importStem(i)}
                      >
                        Import stem
                      </button>
                    </div>
                  );
                })}
              </div>
              <p>
                {p.engine.getStems().every(Boolean) &&
                p.engine.getStems().length === 4
                  ? "FOUR STEMS READY · click to mute / Shift-click to solo"
                  : "Native neural separation runs locally in this browser. Large files need time and memory."}
              </p>
              <Key
                disabled={!loaded || p.busy}
                onClick={p.actions.separateStems}
              >
                SEPARATE FOUR STEMS
              </Key>
            </div>
          )}
          {p.view.module === "grid" && (
            <div className="grid-module">
              <div className="grid-tempo">
                <Field
                  label="SOURCE TEMPO · BPM"
                  type="number"
                  min={30}
                  max={300}
                  step={0.01}
                  value={p.state.sourceBpm}
                  disabled={!loaded}
                  onChange={(e) =>
                    gridEdit((s) => {
                      s.sourceBpm = Math.min(
                        300,
                        Math.max(30, Number(e.target.value)),
                      );
                      s.beatgrid = true;
                    })
                  }
                />
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.sourceBpm = Math.max(30, s.sourceBpm / 2);
                    })
                  }
                >
                  ½
                </Key>
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.sourceBpm = Math.min(300, s.sourceBpm * 2);
                    })
                  }
                >
                  2×
                </Key>
                <Key
                  active={p.state.beatgrid}
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.beatgrid = !s.beatgrid;
                    })
                  }
                >
                  GRID
                </Key>
              </div>
              <div className="grid-tool-row">
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.tempoMarkers = [
                        { time: p.audio.sourceTime, bpm: s.sourceBpm },
                        ...s.tempoMarkers.filter(
                          (m) => m.time > p.audio.sourceTime,
                        ),
                      ].sort((a, b) => a.time - b.time);
                      s.beatgrid = true;
                    })
                  }
                >
                  SET START
                </Key>
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.tempoMarkers = s.tempoMarkers.map((m) => ({
                        ...m,
                        time: Math.max(0, m.time - 0.001),
                      }));
                    })
                  }
                >
                  SLIP −1 ms
                </Key>
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.tempoMarkers = s.tempoMarkers.map((m) => ({
                        ...m,
                        time: Math.min(s.source!.duration, m.time + 0.001),
                      }));
                    })
                  }
                >
                  SLIP +1 ms
                </Key>
              </div>
              <div className="grid-tool-row">
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.tempoMarkers = [
                        ...s.tempoMarkers.filter(
                          (m) => Math.abs(m.time - p.audio.sourceTime) > 0.01,
                        ),
                        { time: p.audio.sourceTime, bpm: s.sourceBpm },
                      ].sort((a, b) => a.time - b.time);
                      s.beatgrid = true;
                    })
                  }
                >
                  SET MARKER
                </Key>
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      let closest = 0;
                      for (let i = 1; i < s.tempoMarkers.length; i++)
                        if (
                          Math.abs(
                            s.tempoMarkers[i].time - p.audio.sourceTime,
                          ) <
                          Math.abs(
                            s.tempoMarkers[closest].time - p.audio.sourceTime,
                          )
                        )
                          closest = i;
                      s.tempoMarkers.splice(closest, 1);
                    })
                  }
                >
                  CLEAR MARKER
                </Key>
                <Key
                  disabled={!loaded}
                  onClick={() =>
                    gridEdit((s) => {
                      s.tempoMarkers = [];
                      s.beatgrid = false;
                    })
                  }
                >
                  CLEAR ALL
                </Key>
              </div>
              <div className="key-row grid-confirm">
                <Key
                  active={gridDirty}
                  disabled={!loaded || !gridDirty}
                  onClick={() => {
                    gridBackup.current = cloneSession(p.state);
                    setGridDirty(false);
                    p.setView({ module: "trim" });
                  }}
                >
                  SAVE GRID
                </Key>
                <Key
                  onClick={() => {
                    if (gridBackup.current) {
                      const backup = gridBackup.current;
                      p.change((s) => {
                        s.sourceBpm = backup.sourceBpm;
                        s.tempoMarkers = backup.tempoMarkers;
                        s.beatgrid = backup.beatgrid;
                      });
                    }
                    setGridDirty(false);
                    p.setView({ module: "trim" });
                  }}
                >
                  CANCEL
                </Key>
              </div>
            </div>
          )}
        </div>
        <div className="deck-status" role="status" aria-live="polite">
          {p.busy ? (
            <>
              <progress
                aria-label="Current operation progress"
                value={p.progress ?? undefined}
                max={1}
              />
              <span>{p.status}</span>
              <Key onClick={p.actions.cancel}>CANCEL</Key>
            </>
          ) : (
            p.status
          )}
        </div>
      </Panel>
      {menu && (
        <div className="menu-backdrop" onClick={() => setMenu(null)}>
          <div
            className="cue-menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 280),
              top: Math.min(menu.y, window.innerHeight - 310),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong>PAD {menu.pad + 1}</strong>
            <Key
              onClick={() => {
                setRename({ pad: menu.pad, name: p.state.cues[menu.pad].name });
                setMenu(null);
              }}
            >
              RENAME CUE
            </Key>
            <Key
              onClick={() => {
                p.change((s) => {
                  s.cues[menu.pad].favorite = !s.cues[menu.pad].favorite;
                });
                setMenu(null);
              }}
            >
              <Heart size={14} /> FAVORITE
            </Key>
            <Select
              label="DESTINATION / BOTH BANKS"
              value={destination}
              onChange={(e) => setDestination(Number(e.target.value))}
            >
              {p.state.cues.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.id < 16 ? "A" : "B"}
                  {String((c.id % 16) + 1).padStart(2, "0")} /{" "}
                  {c.empty ? "EMPTY" : c.name}
                </option>
              ))}
            </Select>
            <div className="key-row">
              <Key
                disabled={destination === menu.pad}
                onClick={() => move(menu.pad, destination, true)}
              >
                <Copy size={13} /> COPY
              </Key>
              <Key
                disabled={destination === menu.pad}
                onClick={() => move(menu.pad, destination, false)}
              >
                MOVE / SWAP
              </Key>
            </div>
            <Key
              danger
              onClick={() => {
                p.change((s) => {
                  s.cues[menu.pad] = blankCue(menu.pad);
                });
                setMenu(null);
              }}
            >
              DELETE CUE
            </Key>
          </div>
        </div>
      )}
      {rename && (
        <div className="modal-backdrop">
          <form
            className="hardware-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              p.change((s) => {
                s.cues[rename.pad].name =
                  rename.name.trim() || `CUE ${rename.pad + 1}`;
              });
              setRename(null);
            }}
          >
            <h2>RENAME PAD {rename.pad + 1}</h2>
            <Field
              label="Cue name"
              value={rename.name}
              autoFocus
              maxLength={64}
              onChange={(e) => setRename({ ...rename, name: e.target.value })}
            />
            <div className="key-row">
              <Key onClick={() => setRename(null)}>CANCEL</Key>
              <button className="key is-active" type="submit">
                SAVE NAME
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
