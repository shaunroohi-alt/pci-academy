import { useState } from "react";
import type { ConsoleProps } from "../ui-contracts";
import type { Mode, PlayMode } from "../model";
import { Field, Key, Meter, Readout, Select } from "./Controls";
import { SamplerPage } from "./SamplerPage";
import { PatternPage, SongPage } from "./TimelineEditors";
import { EffectsPage, PerformPage } from "./StudioPages";
import "../styles.css";
const modes: { id: Mode; name: string; title: string; description: string }[] =
  [
    {
      id: "sample",
      name: "SAMPLE",
      title: "CHOP LAB",
      description: "32 CUES / TWO PAD BANKS / FIVE EDIT MODULES",
    },
    {
      id: "song",
      name: "SONG",
      title: "SONG ASSEMBLY",
      description: "EIGHT TRACKS / PATTERNS + AUDIO / CLIP ARRANGEMENT",
    },
    {
      id: "pattern",
      name: "PATTERN",
      title: "PATTERN WRITER",
      description: "SIXTEEN PATTERNS / NOTE RECORDING + EDITING",
    },
    {
      id: "effects",
      name: "EFFECTS",
      title: "SIGNAL WORKSHOP",
      description: "SOUND DESIGN / MIXING / MASTERING",
    },
    {
      id: "perform",
      name: "PERFORM",
      title: "LIVE CONSOLE",
      description: "FOUR SCENES / EIGHT CHANNELS / LIVE MIX RECORDING",
    },
  ];
export function SamplerConsole(props: ConsoleProps) {
  const [audioMenu, setAudioMenu] = useState(false);
  const p = props;
  const page = modes.find((m) => m.id === p.view.mode)!;
  const playMode: PlayMode =
    p.view.mode === "song"
      ? "song"
      : p.view.mode === "perform"
        ? "perform"
        : p.view.mode === "effects"
          ? p.runtime.mode
          : "pattern";
  const play = () => void p.studio.play(playMode).catch(p.reportError);
  const stop = () => {
    p.studio.stop();
    p.engine.stopVoices();
    p.engine.pauseSource();
    if (p.audio.recording) p.actions.recordMix();
  };
  const beat = Math.max(0, p.runtime.beat),
    bar = Math.floor(beat / 4) + 1,
    quarter = (Math.floor(beat) % 4) + 1,
    tick = Math.floor((beat % 1) * 96);
  return (
    <div
      className={`brain-storm mode-${p.view.mode}`}
      data-testid="brain-storm-console"
    >
      <aside className="mode-rail" aria-label="Work surfaces">
        <div className="samplify-brand">
          <strong>SAMPLIFY</strong>
          <span>MP AUDIO / MPC-32</span>
        </div>
        <div className="rail-vent" aria-hidden="true" />
        <span className="rail-caption">WORK SURFACE</span>
        <nav>
          {modes.map((mode, i) => (
            <Key
              dark
              key={mode.id}
              active={p.view.mode === mode.id}
              aria-label={`${mode.name} work surface`}
              onClick={() => p.setView({ mode: mode.id })}
            >
              {String(i + 1).padStart(2, "0")} {mode.name}
            </Key>
          ))}
        </nav>
        <div className="rail-session">
          <span className="rail-caption">SESSION MEMORY</span>
          <div className="key-row">
            <Key onClick={p.actions.openSession}>OPEN</Key>
            <Key onClick={p.actions.saveSession}>SAVE</Key>
          </div>
          <div className="audio-menu-host">
            <Key onClick={() => setAudioMenu(!audioMenu)}>AUDIO / MIDI</Key>
            {audioMenu && (
              <div className="audio-menu">
                <Key
                  onClick={() => {
                    p.actions.connectMidi();
                    setAudioMenu(false);
                  }}
                >
                  CONNECT MIDI
                </Key>
                <Key
                  onClick={() => {
                    p.actions.loadDemo();
                    setAudioMenu(false);
                  }}
                >
                  LOAD DEMO
                </Key>
                <Key
                  disabled={!p.state.source}
                  onClick={() => {
                    p.actions.exportCue();
                    setAudioMenu(false);
                  }}
                >
                  EXPORT CUE WAV
                </Key>
                <Key
                  disabled={!p.state.source}
                  onClick={() => {
                    p.actions.exportAll();
                    setAudioMenu(false);
                  }}
                >
                  EXPORT ALL CUES
                </Key>
                <Key
                  onClick={() => {
                    void p.engine.initialize().catch(p.reportError);
                    setAudioMenu(false);
                  }}
                >
                  ENABLE AUDIO
                </Key>
                <a
                  className="key"
                  href={`${import.meta.env.BASE_URL}source.zip`}
                  download
                >
                  SOURCE / LICENSES
                </a>
              </div>
            )}
          </div>
        </div>
      </aside>
      <header
        className={`console-masthead ${p.view.mode !== "sample" ? "has-status" : ""}`}
      >
        <h1>{page.title}</h1>
        {p.view.mode === "sample" ? (
          <span>{page.description}</span>
        ) : (
          <div className="console-status" role="status" aria-live="polite">
            {p.busy && (
              <progress
                aria-label="Current operation progress"
                value={p.progress ?? undefined}
                max={1}
              />
            )}
            <span title={p.status}>{p.status}</span>
            {p.busy && (
              <Key
                aria-label="Cancel current operation"
                onClick={p.actions.cancel}
              >
                CANCEL
              </Key>
            )}
          </div>
        )}
      </header>
      <main className="console-workspace" aria-label={page.title}>
        {p.view.mode === "sample" ? (
          <SamplerPage {...p} />
        ) : p.view.mode === "song" ? (
          <SongPage {...p} />
        ) : p.view.mode === "pattern" ? (
          <PatternPage {...p} />
        ) : p.view.mode === "effects" ? (
          <EffectsPage {...p} />
        ) : (
          <PerformPage {...p} />
        )}
      </main>
      <footer className="transport-dock" aria-label="Global transport">
        <Readout className="transport-clock">
          <strong>
            {String(bar).padStart(3, "0")} . {quarter} .{" "}
            {String(tick).padStart(2, "0")}
          </strong>
          <span>
            {p.runtime.playing ? "RUN" : "STOP"} {p.runtime.mode.toUpperCase()}
            {p.runtime.recordingNotes ? " / NOTE REC" : ""}
            {p.audio.recording ? " / MIX REC" : ""}
          </span>
        </Readout>
        <Field
          label="TEMPO"
          aria-label="Studio tempo"
          type="number"
          min={20}
          max={999}
          step={0.1}
          value={p.state.tempo}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v))
              p.change((s) => {
                s.tempo = Math.min(999, Math.max(20, v));
              });
          }}
        />
        <Select
          label="PATTERN MEMORY"
          value={p.state.selectedPattern}
          onChange={(e) =>
            p.change((s) => {
              s.selectedPattern = Number(e.target.value);
            }, false)
          }
        >
          {p.state.patterns.map((pattern, i) => (
            <option key={pattern.id} value={i}>
              P{String(i + 1).padStart(2, "0")} {pattern.name}
            </option>
          ))}
        </Select>
        <div className="dock-transport">
          <span>TRANSPORT / RECORDER</span>
          <div>
            <Key dark active={p.runtime.playing} onClick={play}>
              PLAY
            </Key>
            <Key dark onClick={stop}>
              STOP
            </Key>
            <Key
              dark
              danger
              active={p.runtime.recordingNotes}
              onClick={() => {
                p.studio.armNotes(!p.runtime.recordingNotes);
                if (!p.runtime.playing) play();
              }}
            >
              REC NOTES
            </Key>
            <Key
              dark
              danger
              active={p.audio.recording}
              onClick={p.actions.recordMix}
            >
              REC MIX
            </Key>
          </div>
        </div>
        <div className="dock-history">
          <span>EDIT HISTORY</span>
          <div>
            <Key disabled={!p.actions.canUndo} onClick={p.actions.undo}>
              UNDO
            </Key>
            <Key disabled={!p.actions.canRedo} onClick={p.actions.redo}>
              REDO
            </Key>
          </div>
        </div>
        <div className="dock-output">
          <span>OUT</span>
          <Meter value={p.audio.masterPeak} />
        </div>
      </footer>
    </div>
  );
}
export default SamplerConsole;
