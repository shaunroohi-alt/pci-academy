import { useState } from "react";
import type { ConsoleProps } from "../ui-contracts";
import type { EffectSlot, EffectType, LaunchSlot } from "../model";
import {
  effectDefinitions,
  effectPresets,
  formatParameterValue,
} from "../audio/effects";
import { Field, Key, Knob, Meter, Panel, Readout, Select } from "./Controls";
const desktopRelease =
  "https://github.com/sroohi/mellowdy-chop/releases/tag/samplify-v0.4.0-065cdf2";
function rackFor(p: ConsoleProps, bus: number) {
  return bus < 8
    ? p.state.tracks[bus].effects
    : bus === 8
      ? p.state.masterEffects
      : bus === 9
        ? p.state.sendAEffects
        : p.state.sendBEffects;
}
function updateRack(
  p: ConsoleProps,
  bus: number,
  edit: (rack: EffectSlot[]) => void,
) {
  p.change((s) =>
    edit(
      bus < 8
        ? s.tracks[bus].effects
        : bus === 8
          ? s.masterEffects
          : bus === 9
            ? s.sendAEffects
            : s.sendBEffects,
    ),
  );
}
export function EffectsPage(p: ConsoleProps) {
  const [bus, setBus] = useState(p.state.selectedTrack),
    [slot, setSlot] = useState(0),
    [preset, setPreset] = useState("");
  const rack = rackFor(p, bus),
    effect = rack[slot],
    definition = effectDefinitions[effect.type];
  const mutate = (fn: (s: EffectSlot) => void) =>
    updateRack(p, bus, (r) => fn(r[slot]));
  return (
    <div className="effects-workspace">
      <Panel
        title="PATCH BAY / TARGET BUS + CHAIN PRESET"
        className="effects-patch"
      >
        <Select
          label="Target effect bus"
          value={bus}
          onChange={(e) => setBus(Number(e.target.value))}
        >
          {p.state.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              TRACK {t.id + 1} / {t.name}
            </option>
          ))}
          <option value="8">MASTER OUTPUT</option>
          <option value="9">SEND A RETURN</option>
          <option value="10">SEND B RETURN</option>
        </Select>
        <Select
          label="Load chain preset"
          value={preset}
          onChange={(e) => {
            const choice = effectPresets.find((q) => q.name === e.target.value);
            if (choice) {
              updateRack(p, bus, (r) =>
                r.splice(0, 4, ...structuredClone(choice.slots)),
              );
              setPreset(choice.name);
            }
          }}
        >
          <option value="">LOAD CHAIN PRESET…</option>
          {(["Sound Design", "Mixing", "Mastering"] as const).map(
            (category) => (
              <optgroup label={category} key={category}>
                {effectPresets
                  .filter((q) => q.category === category)
                  .map((q) => (
                    <option key={q.name} value={q.name}>
                      {q.name}
                    </option>
                  ))}
              </optgroup>
            ),
          )}
        </Select>
      </Panel>
      <div className="effect-cartridges">
        {rack.map((item, i) => (
          <Panel key={i} title={`BUILT-IN PROCESSOR ${i + 1}`}>
            <Key dark active={slot === i} onClick={() => setSlot(i)}>
              {effectDefinitions[item.type].name}
            </Key>
            {i < 3 && (
              <span className="signal-arrow" aria-hidden="true">
                ›
              </span>
            )}
          </Panel>
        ))}
      </div>
      <Panel title="PROCESSOR CONTROL" className="processor-control">
        <Readout className="effect-lcd">
          <strong>{definition.name}</strong>
          <span>
            {bus < 8
              ? `TRACK ${bus + 1}`
              : bus === 8
                ? "MASTER"
                : bus === 9
                  ? "SEND A"
                  : "SEND B"}{" "}
            / INSERT {slot + 1}
          </span>
        </Readout>
        <div className="effect-model">
          <Select
            label="Processor model"
            value={effect.type}
            onChange={(e) => {
              const type = e.target.value as EffectType;
              mutate((s) => {
                s.type = type;
                s.parameters = [...effectDefinitions[type].defaults];
                s.bypass = false;
              });
              setPreset("");
            }}
          >
            {Object.entries(effectDefinitions).map(([type, d]) => (
              <option key={type} value={type}>
                {d.name}
              </option>
            ))}
          </Select>
          <Key
            active={effect.bypass}
            onClick={() =>
              mutate((s) => {
                s.bypass = !s.bypass;
              })
            }
          >
            BYPASS FX
          </Key>
          <p>{definition.description}</p>
        </div>
        <div className="effect-parameters">
          {definition.parameters.map((parameter, i) => (
            <Knob
              key={`${effect.type}-${i}`}
              label={parameter.name}
              value={effect.parameters[i] ?? parameter.defaultValue}
              min={0}
              max={1}
              step={0.001}
              unit={parameter.unit || " "}
              format={(v) => formatParameterValue(effect.type, i, v)}
              begin={p.beginGesture}
              end={p.endGesture}
              onChange={(v) =>
                mutate((s) => {
                  s.parameters[i] = v;
                })
              }
              disabled={effect.bypass}
            />
          ))}
          <Knob
            label="DRY / WET"
            value={effect.mix * 100}
            min={0}
            max={100}
            step={0.1}
            unit="%"
            begin={p.beginGesture}
            end={p.endGesture}
            onChange={(v) =>
              mutate((s) => {
                s.mix = v / 100;
              })
            }
          />
        </div>
      </Panel>
      <Panel
        title="EXTERNAL PLUGINS / NATIVE APP"
        className="native-plugin-bay"
      >
        <div>
          <strong>AU + VST3</strong>
          <p>
            Installed Audio Unit and VST3 plugins run in the native Samplify
            app. This browser uses the built-in processor rack above.
          </p>
        </div>
        <a
          className="key key-dark"
          href={desktopRelease}
          target="_blank"
          rel="noreferrer"
        >
          OPEN MACOS DOWNLOAD
        </a>
      </Panel>
    </div>
  );
}
const contentLabel = (p: ConsoleProps, slot: LaunchSlot | null) =>
  !slot
    ? "+ ASSIGN"
    : slot.kind === "pattern"
      ? `P${String(p.state.patterns.findIndex((q) => q.id === slot.contentId) + 1).padStart(2, "0")} ${p.state.patterns.find((q) => q.id === slot.contentId)?.name || "MISSING PATTERN"}`
      : p.state.assets.find((a) => a.assetId === slot.contentId)?.name ||
        "MISSING AUDIO";
export function PerformPage(p: ConsoleProps) {
  const [content, setContent] = useState(
    `pattern:${p.state.patterns[p.state.selectedPattern].id}`,
  );
  const assignment = (): LaunchSlot =>
    content.startsWith("pattern:")
      ? { kind: "pattern", contentId: content.slice(8) }
      : { kind: "audio", contentId: content.slice(6) };
  return (
    <div className="perform-workspace">
      <Panel title="LAUNCHER / CLIP CARTRIDGE" className="performance-toolbar">
        <Select
          label="Launch quantization"
          value={p.state.launchQuantize}
          onChange={(e) =>
            p.change((s) => {
              s.launchQuantize = Number(e.target.value);
            })
          }
        >
          <option value="0">IMMEDIATE</option>
          <option value="1">NEXT BEAT</option>
          <option value="4">NEXT BAR</option>
          <option value="8">NEXT 2 BARS</option>
        </Select>
        <Key onClick={p.actions.importAsset}>IMPORT AUDIO</Key>
        <Select
          label="Clip assignment"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        >
          <optgroup label="PATTERNS">
            {p.state.patterns.map((q, i) => (
              <option key={q.id} value={`pattern:${q.id}`}>
                P{String(i + 1).padStart(2, "0")} {q.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="AUDIO LOOPS">
            {p.state.assets.map((a) => (
              <option value={`audio:${a.assetId}`} key={a.assetId}>
                {a.name}
              </option>
            ))}
          </optgroup>
        </Select>
        <small>
          Empty: assign · Loaded: launch · Shift-click: clear · Right-click:
          replace
        </small>
      </Panel>
      <div className="mixer-console">
        <div className="channel-strips">
          {p.state.tracks.map((track, t) => (
            <section
              className="channel-strip"
              key={t}
              style={
                {
                  "--track-colour": p.state.cues[t * 4].colour,
                } as React.CSSProperties
              }
            >
              <Key
                active={p.state.selectedTrack === t}
                className="channel-name"
                onClick={() =>
                  p.change((s) => {
                    s.selectedTrack = t;
                  }, false)
                }
              >
                {track.name}
              </Key>
              <div className="channel-launches">
                {[0, 1, 2, 3].map((scene) => {
                  const slot = p.state.launchSlots[t][scene],
                    active = p.runtime.activeScene[t] === scene,
                    pending = p.runtime.pendingScene[t] === scene;
                  return (
                    <button
                      className={`launch-cell ${active ? "is-playing" : ""} ${pending ? "is-pending" : ""} ${!slot ? "is-empty" : ""}`}
                      key={scene}
                      aria-label={`Track ${t + 1}, scene ${scene + 1}, ${contentLabel(p, slot)}`}
                      onClick={(e) => {
                        if (e.shiftKey)
                          p.change((s) => {
                            s.launchSlots[t][scene] = null;
                          });
                        else if (!slot)
                          p.change((s) => {
                            s.launchSlots[t][scene] = assignment();
                          });
                        else
                          void p.studio.launch(t, scene).catch(p.reportError);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        p.change((s) => {
                          s.launchSlots[t][scene] = assignment();
                        });
                      }}
                    >
                      <i />
                      {contentLabel(p, slot)}
                    </button>
                  );
                })}
              </div>
              <div className="mute-solo">
                <Key
                  active={track.mute}
                  aria-label={`Mute track ${t + 1}`}
                  onClick={() =>
                    p.change((s) => {
                      s.tracks[t].mute = !s.tracks[t].mute;
                    })
                  }
                >
                  M
                </Key>
                <Key
                  active={track.solo}
                  aria-label={`Solo track ${t + 1}`}
                  onClick={() =>
                    p.change((s) => {
                      s.tracks[t].solo = !s.tracks[t].solo;
                    })
                  }
                >
                  S
                </Key>
              </div>
              <div className="channel-mix-controls">
                <div className="channel-fader">
                  <input
                    type="range"
                    aria-label={`Track ${t + 1} level`}
                    min={-60}
                    max={12}
                    step={0.1}
                    value={track.gainDb}
                    onPointerDown={p.beginGesture}
                    onPointerUp={p.endGesture}
                    onChange={(e) =>
                      p.change((s) => {
                        s.tracks[t].gainDb = Number(e.target.value);
                      })
                    }
                  />
                  <Meter
                    vertical
                    value={p.audio.trackPeaks[t] || 0}
                    label={`Track ${t + 1} peak`}
                  />
                </div>
                <div className="channel-knobs">
                  <Knob
                    label="PAN"
                    value={track.pan}
                    min={-1}
                    max={1}
                    step={0.01}
                    begin={p.beginGesture}
                    end={p.endGesture}
                    onChange={(v) =>
                      p.change((s) => {
                        s.tracks[t].pan = v;
                      })
                    }
                  />
                  <Knob
                    label="SEND A"
                    value={track.sendA}
                    min={0}
                    max={1}
                    step={0.01}
                    begin={p.beginGesture}
                    end={p.endGesture}
                    onChange={(v) =>
                      p.change((s) => {
                        s.tracks[t].sendA = v;
                      })
                    }
                  />
                  <Knob
                    label="SEND B"
                    value={track.sendB}
                    min={0}
                    max={1}
                    step={0.01}
                    begin={p.beginGesture}
                    end={p.endGesture}
                    onChange={(v) =>
                      p.change((s) => {
                        s.tracks[t].sendB = v;
                      })
                    }
                  />
                </div>
              </div>
              <div className="channel-db">{track.gainDb.toFixed(1)} dB</div>
              <Select
                aria-label={`Track ${t + 1} crossfader assignment`}
                value={track.cross}
                onChange={(e) =>
                  p.change((s) => {
                    s.tracks[t].cross = e.target.value as typeof track.cross;
                  })
                }
              >
                <option value="thru">THRU</option>
                <option value="a">A</option>
                <option value="b">B</option>
              </Select>
              <Key
                className="channel-stop"
                onClick={() => p.studio.stopTrack(t)}
              >
                STOP
              </Key>
            </section>
          ))}
        </div>
        <Panel title="SCENE / MASTER" className="scene-master">
          <div className="scene-keys">
            {[0, 1, 2, 3].map((scene) => (
              <Key
                key={scene}
                active={p.runtime.activeScene.every((s) => s === scene)}
                onClick={() =>
                  void p.studio.launchScene(scene).catch(p.reportError)
                }
              >
                SCENE {scene + 1}
              </Key>
            ))}
          </div>
          <div className="master-mixer">
            <Knob
              label="MASTER LEVEL"
              value={p.state.masterGainDb}
              min={-60}
              max={12}
              step={0.1}
              unit="dB"
              begin={p.beginGesture}
              end={p.endGesture}
              onChange={(v) =>
                p.change((s) => {
                  s.masterGainDb = v;
                })
              }
            />
            <Meter value={p.audio.masterPeak} />
            <small>STEREO OUTPUT</small>
            <label className="crossfader">
              <span>
                A <b>CROSSFADER</b> B
              </span>
              <input
                type="range"
                aria-label="Master crossfader"
                min={0}
                max={1}
                step={0.001}
                value={p.state.crossfader}
                onPointerDown={p.beginGesture}
                onPointerUp={p.endGesture}
                onChange={(e) =>
                  p.change((s) => {
                    s.crossfader = Number(e.target.value);
                  })
                }
              />
            </label>
          </div>
        </Panel>
      </div>
    </div>
  );
}
