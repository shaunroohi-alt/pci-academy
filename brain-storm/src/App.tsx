"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserAudioEngine } from "./audio";
import { BrowserStudioController } from "./studio";
import { BrowserStemService } from "./stems";
import { SamplerConsole } from "./components/SamplerConsole";
import { blankCue, cloneSession, createSession, quantize, uid } from "./model";
import type { SessionState, SourceInfo } from "./model";
import type { ConsoleActions, ViewState } from "./ui-contracts";
import {
  download,
  openSession,
  persistBuffer,
  persistState,
  restoreDraft,
  saveSession,
  sessionName,
  wav,
} from "./session";
import { readSeratoCues } from "./metadata";
import "./styles.css";

const typing = "awsedftgyhujkolp";
interface CueMetadata {
  index: number;
  time: number;
  name: string;
  colour: string;
}
function chooseFile(accept: string, handle: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      if (file) handle(file);
    },
    { once: true },
  );
  input.click();
}
export default function BrainStormApp() {
  const [engine] = useState(() => new BrowserAudioEngine());
  const [studio] = useState(() => new BrowserStudioController(engine));
  const [state, setState] = useState(createSession);
  const current = useRef(state);
  const [view, setViewState] = useState<ViewState>({
    mode: "sample",
    bank: 0,
    module: "trim",
    selection: [0],
    options: false,
  });
  const currentView = useRef(view);
  const [audio, setAudio] = useState(engine.snapshot());
  const [runtime, setRuntime] = useState(studio.snapshot());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [status, setStatus] = useState(
    "Load audio, or choose Load Demo from the session menu.",
  );
  const [progress, setProgress] = useState<number | null>(null);
  const operation = useRef<AbortController | null>(null);
  const undoStack = useRef<SessionState[]>([]),
    redoStack = useRef<SessionState[]>([]),
    gesture = useRef<SessionState | null>(null);
  const [, historyRevision] = useState(0);
  const metadata = useRef<CueMetadata[]>([]);
  const mounted = useRef(true);
  const revision = useRef(0);
  const held = useRef(new Map<string, string>());
  const midiAccess = useRef<MIDIAccess | null>(null);
  const reportError = useCallback((error: unknown) => {
    if (mounted.current)
      setStatus(error instanceof Error ? error.message : String(error));
  }, []);
  const setView = useCallback((patch: Partial<ViewState>) => {
    currentView.current = { ...currentView.current, ...patch };
    setViewState(currentView.current);
  }, []);
  const install = useCallback(
    (next: SessionState) => {
      current.current = next;
      engine.setSession(next);
      studio.setSession(next);
      setState(next);
    },
    [engine, studio],
  );
  const change = useCallback(
    (edit: (draft: SessionState) => void, history = true) => {
      revision.current++;
      const next = cloneSession(current.current);
      edit(next);
      if (history && !gesture.current) {
        undoStack.current.push(current.current);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
        historyRevision((x) => x + 1);
      }
      install(next);
    },
    [install],
  );
  const clearHistory = () => {
    undoStack.current = [];
    redoStack.current = [];
    historyRevision((x) => x + 1);
  };
  const beginGesture = () => {
    if (!gesture.current) gesture.current = current.current;
  };
  const endGesture = () => {
    if (gesture.current && gesture.current !== current.current) {
      undoStack.current.push(gesture.current);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      historyRevision((x) => x + 1);
    }
    gesture.current = null;
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (previous) {
      redoStack.current.push(current.current);
      install(previous);
      historyRevision((x) => x + 1);
    }
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (next) {
      undoStack.current.push(current.current);
      install(next);
      historyRevision((x) => x + 1);
    }
  };
  const run = (label: string, task: (signal: AbortSignal) => Promise<void>) => {
    if (busyRef.current) return;
    revision.current++;
    busyRef.current = true;
    setBusy(true);
    setStatus(label);
    setProgress(null);
    const controller = new AbortController();
    operation.current = controller;
    void task(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) setStatus("Operation cancelled.");
        else reportError(error);
      })
      .finally(() => {
        if (operation.current === controller) {
          if (controller.signal.aborted && mounted.current)
            setStatus("Operation cancelled.");
          operation.current = null;
          busyRef.current = false;
          setBusy(false);
          setProgress(null);
        }
      });
  };
  const rememberAudio = async () => {
    const s = current.current;
    const ids = new Set([
      ...(s.source ? [s.source.assetId] : []),
      ...s.assets.map((a) => a.assetId),
    ]);
    try {
      for (const id of ids) {
        const buffer = engine.getBuffer(id);
        if (buffer) await persistBuffer(id, buffer);
      }
      if (s.source)
        for (const [i, buffer] of engine.getStems().entries())
          if (buffer)
            await persistBuffer(`${s.source.assetId}:stem:${i}`, buffer);
      await persistState(s);
    } catch {
      setStatus(
        "Local backup is unavailable. Save a session file to keep this project.",
      );
    }
  };
  const sourceLoaded = (info: SourceInfo) => {
    studio.stop();
    engine.pauseSource();
    engine.stopVoices();
    engine.setStems([null, null, null, null]);
    const next = cloneSession(current.current);
    next.source = info;
    next.seratoCues = metadata.current;
    next.sourceBpm = info.bpm;
    next.cues = Array.from({ length: 32 }, (_, i) => blankCue(i));
    next.stemMute = [false, false, false, false];
    next.tempoMarkers = [{ time: 0, bpm: info.bpm }];
    next.globalPitch = 0;
    next.detune = 0;
    install(next);
    clearHistory();
    setView({ bank: 0, module: "trim", selection: [0], options: false });
    void rememberAudio();
  };
  const loadFile = (file: File) =>
    run("Reading and analysing audio…", async (signal) => {
      const info = await engine.loadSource(file);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      metadata.current = await readSeratoCues(file, info.duration);
      sourceLoaded(info);
      setStatus(
        `${info.name} loaded. Click empty pads at the source playhead, or use Autoset.`,
      );
    });
  const padOn = (pad: number, velocity = 1, pitch = 0) => {
    const s = current.current;
    if (!s.source || busyRef.current || pad < 0 || pad >= 32) return "";
    if (s.cues[pad].empty) {
      const step = 60 / s.sourceBpm / 8;
      const start = Math.min(
        s.source.duration - 0.001,
        Math.max(
          0,
          s.quantize
            ? quantize(engine.snapshot().sourceTime, step)
            : engine.snapshot().sourceTime,
        ),
      );
      change((d) => {
        d.cues[pad] = {
          ...blankCue(pad),
          empty: false,
          start,
          end: d.source!.duration,
        };
      });
    }
    setView({ selection: [pad], bank: pad >= 16 ? 1 : 0 });
    return studio.noteOn(pad, velocity, pitch);
  };
  const autoSet: ConsoleActions["autoSet"] = (mode, size = 1) => {
    const s = current.current;
    if (!s.source) return;
    const buffer = engine.getBuffer(s.source.assetId);
    if (!buffer) return;
    if (mode === "serato" && !metadata.current.length) {
      setStatus(
        "No supported embedded Serato hotcues were found in this file.",
      );
      return;
    }
    const selected = s.cues[currentView.current.selection[0] ?? 0],
      start = engine.snapshot().sourceTime;
    const duration = s.source.duration;
    let positions: number[] = [];
    if (mode === "find") {
      const data = buffer.getChannelData(0),
        hop = Math.max(1, Math.floor(buffer.sampleRate * 0.025));
      let previous = 0;
      const events: { time: number; score: number }[] = [];
      for (let p = 0; p < data.length; p += hop) {
        let e = 0;
        const end = Math.min(data.length, p + hop);
        for (let i = p; i < end; i += 4) e += data[i] * data[i];
        const energy = Math.sqrt(e / Math.max(1, (end - p) / 4));
        const score = Math.max(0, energy - previous);
        if (score > 0.008) events.push({ time: p / buffer.sampleRate, score });
        previous = energy;
      }
      events.sort((a, b) => b.score - a.score);
      const found: number[] = [];
      for (const e of events) {
        if (found.every((t) => Math.abs(t - e.time) > 0.12)) found.push(e.time);
        if (found.length === 32) break;
      }
      positions = found.sort((a, b) => a - b);
      if (!positions.length) positions = [0];
    } else if (mode === "slicer")
      positions = Array.from(
        { length: 32 },
        (_, i) => start + i * (60 / s.sourceBpm) * size,
      );
    else if (mode === "random") {
      const random = new Uint32Array(32);
      crypto.getRandomValues(random);
      positions = Array.from(
        random,
        (x) => (x / 4294967296) * Math.max(0, duration - 0.01),
      ).sort((a, b) => a - b);
    }
    change((d) => {
      for (let i = 0; i < 32; i++) {
        if (d.cues[i].favorite) continue;
        if (mode === "serato") {
          const cue = metadata.current.find((c) => c.index === i);
          if (cue)
            d.cues[i] = {
              ...blankCue(i),
              empty: false,
              start: cue.time,
              end: duration,
              name: cue.name || `CUE ${i + 1}`,
              colour: cue.colour,
            };
          else d.cues[i] = blankCue(i);
        } else if (mode === "keyshift") {
          const base = selected.empty
            ? { ...blankCue(i), empty: false, start, end: duration }
            : selected;
          d.cues[i] = {
            ...base,
            id: i,
            name: `KEY ${i + 1}`,
            favorite: false,
            pitch: Math.max(
              -48,
              Math.min(
                48,
                base.pitch +
                  (i - (currentView.current.selection[0] ?? 0)) * size,
              ),
            ),
          };
        } else {
          const at = positions[i];
          d.cues[i] =
            at !== undefined && at < duration
              ? {
                  ...blankCue(i),
                  empty: false,
                  start: at,
                  end:
                    mode === "slicer"
                      ? Math.min(duration, at + (60 / d.sourceBpm) * size)
                      : duration,
                }
              : blankCue(i);
        }
      }
    });
    setStatus(
      `${mode === "find" ? "Find Samples" : mode === "serato" ? "Serato hotcues" : mode === "keyshift" ? "Key Shift Pad" : mode === "random" ? "Random samples" : "Slicer"} assigned. Favorites were preserved.`,
    );
  };
  const importAssetFile = (file: File) =>
    run("Importing audio clip…", async (signal) => {
      const info = await engine.loadAsset(file, current.current.tempo);
      if (signal.aborted) return;
      change((d) => {
        d.assets.push(info);
      });
      await rememberAudio();
      setStatus(`${info.name} is available in the clip library.`);
    });
  const actions: ConsoleActions = {
    loadSource: () => {
      void engine.initialize().catch(reportError);
      chooseFile("audio/*,.wav,.aif,.aiff,.flac,.mp3", loadFile);
    },
    loadDemo: () =>
      run("Loading demo…", async (signal) => {
        const info = await engine.loadDemo();
        if (signal.aborted) return;
        metadata.current = [];
        sourceLoaded(info);
        setStatus("Demo loaded. Use Find Samples or play an empty pad.");
      }),
    eject: () => {
      if (busyRef.current) return;
      studio.stop();
      engine.pauseSource();
      engine.stopVoices();
      engine.setStems([null, null, null, null]);
      change((d) => {
        d.source = null;
        d.seratoCues = [];
        d.tempoMarkers = [{ time: 0, bpm: d.sourceBpm }];
        d.cues = Array.from({ length: 32 }, (_, i) => blankCue(i));
        d.stemMute = [false, false, false, false];
      });
      metadata.current = [];
      clearHistory();
      setStatus(
        "Sample memory cleared. Studio patterns and imported audio remain available.",
      );
    },
    openSession: () => {
      void engine.initialize().catch(reportError);
      chooseFile(".brainstorm,.zip", (file) =>
        run("Opening session…", async (signal) => {
          const next = await openSession(file, engine, () => !signal.aborted);
          if (signal.aborted) return;
          studio.stop();
          engine.pauseSource();
          install(next);
          clearHistory();
          setView({ bank: 0, selection: [0], module: "trim" });
          metadata.current = next.seratoCues ?? [];
          await rememberAudio();
          setStatus(
            "Session restored, including its source, clips, effects and cached stems.",
          );
        }),
      );
    },
    saveSession: () =>
      run("Packing session and audio…", async (signal) => {
        const blob = await saveSession(current.current, engine, setProgress);
        if (signal.aborted) return;
        download(blob, sessionName(current.current));
        setStatus("Session saved with its audio and stems.");
      }),
    exportCue: () =>
      run("Rendering selected pad…", async (signal) => {
        const index = currentView.current.selection[0] ?? 0;
        if (current.current.cues[index].empty)
          throw new Error("Select an occupied pad to export.");
        const blob = await engine.exportCue(index);
        if (!signal.aborted)
          download(
            blob,
            `${current.current.cues[index].name || `Pad ${index + 1}`}.wav`,
          );
        setStatus("Selected pad exported.");
      }),
    exportAll: () =>
      run("Rendering occupied pads…", async (signal) => {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const occupied = current.current.cues.filter((c) => !c.empty);
        for (const [i, cue] of occupied.entries()) {
          if (signal.aborted) return;
          zip.file(
            `${String(cue.id + 1).padStart(2, "0")}-${cue.name.replace(/[^\w -]/g, "_")}.wav`,
            await (await engine.exportCue(cue.id)).arrayBuffer(),
          );
          setProgress((i + 1) / occupied.length);
        }
        if (!occupied.length)
          throw new Error("There are no occupied pads to export.");
        download(
          await zip.generateAsync({ type: "blob" }),
          "Samplify-pads.zip",
        );
        setStatus("All occupied pads exported.");
      }),
    importAsset: () => {
      void engine.initialize().catch(reportError);
      chooseFile("audio/*,.wav,.aif,.aiff,.flac,.mp3", importAssetFile);
    },
    bouncePattern: () =>
      run("Printing pattern with built-in FX…", async (signal) => {
        const s = current.current;
        const buffer = await engine.renderPattern(
          s.selectedPattern,
          s.selectedTrack,
        );
        if (signal.aborted) return;
        const file = new File(
          [wav(buffer, "pcm24")],
          `${s.patterns[s.selectedPattern].name}-bounce.wav`,
          { type: "audio/wav" },
        );
        download(file, file.name);
        const info = await engine.loadAsset(file, s.tempo);
        change((d) => {
          d.assets.push(info);
        });
        await rememberAudio();
        setStatus("Pattern printed and added to the audio clip library.");
      }),
    separateStems: () =>
      run("Preparing local neural stem separation…", async (signal) => {
        const s = current.current;
        if (!s.source) throw new Error("Load a sample first.");
        const input = engine.getBuffer(s.source.assetId);
        if (!input) throw new Error("The source audio is missing.");
        const stems = await new BrowserStemService().separate(
          input,
          (p) => {
            setProgress(p.progress);
            setStatus(p.message);
          },
          signal,
        );
        if (signal.aborted) return;
        engine.setStems(stems);
        await rememberAudio();
        setStatus("Four stems ready. Click to mute, Shift-click to solo.");
      }),
    importStem: (index) => {
      void engine.initialize().catch(reportError);
      chooseFile("audio/*,.wav,.aif,.aiff,.flac,.mp3", (file) =>
        run("Importing aligned stem…", async (signal) => {
          const source = current.current.source;
          if (!source) throw new Error("Load the original source first.");
          const info = await engine.loadAsset(file, source.bpm);
          const buffer = engine.getBuffer(info.assetId)!;
          const original = engine.getBuffer(source.assetId)!;
          if (signal.aborted) return;
          if (
            buffer.length !== original.length ||
            buffer.sampleRate !== original.sampleRate ||
            buffer.numberOfChannels !== original.numberOfChannels
          )
            throw new Error(
              "The stem must match the source length, sample rate and channel count.",
            );
          const stems = engine.getStems().slice();
          stems[index] = buffer;
          engine.setStems(stems);
          await rememberAudio();
          setStatus(
            "Aligned stem imported. Import the remaining stems or run neural separation.",
          );
        }),
      );
    },
    connectMidi: () => {
      void (async () => {
        if (!navigator.requestMIDIAccess)
          throw new Error(
            "Web MIDI is unavailable in this browser. Use Chrome or Edge, or play the pads with the computer keyboard.",
          );
        await engine.initialize();
        const access = await navigator.requestMIDIAccess({ sysex: false });
        midiAccess.current = access;
        const attach = () => {
          for (const input of access.inputs.values())
            input.onmidimessage = (event) => {
              const data = event.data;
              if (!data || data.length < 3) return;
              const command = data[0] & 240,
                note = data[1],
                value = data[2],
                key = `midi:${input.id}:${data[0] & 15}:${note}`;
              if (command === 144 && value > 0) {
                const s = current.current;
                const pad = s.keyboard
                  ? (currentView.current.selection[0] ?? 0)
                  : note - 24;
                if (pad < 0 || pad >= 32) return;
                const previous = held.current.get(key);
                if (previous) studio.noteOff(previous);
                const token = padOn(
                  pad,
                  s.velocity ? value / 127 : 1,
                  s.keyboard ? note - 60 : 0,
                );
                held.current.set(key, token);
              } else if (command === 128 || (command === 144 && value === 0)) {
                const token = held.current.get(key);
                if (token) studio.noteOff(token);
                held.current.delete(key);
              }
            };
        };
        attach();
        access.onstatechange = attach;
        setStatus(
          `MIDI connected: ${access.inputs.size} input${access.inputs.size === 1 ? "" : "s"}. Notes 24–55 address the cue banks.`,
        );
      })().catch(reportError);
    },
    recordMix: () => {
      void (async () => {
        if (engine.snapshot().recording) {
          setStatus("Finalizing mix recording…");
          const blob = await engine.stopRecording();
          const file = new File(
            [blob],
            `Samplify-live-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`,
            { type: "audio/wav" },
          );
          download(blob, file.name);
          const asset = await engine.loadAsset(file, current.current.tempo);
          change((d) => {
            d.assets.push(asset);
          });
          await rememberAudio();
          setStatus("Live mix saved and added to the clip library.");
        } else {
          await engine.startRecording();
          setStatus(
            "Recording the live stereo output. Press Rec Mix again to finish.",
          );
        }
      })().catch(reportError);
    },
    padOn,
    padOff: (token) => {
      if (token) studio.noteOff(token);
    },
    autoSet,
    undo,
    redo,
    cancel: () => operation.current?.abort(),
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    mounted.current = true;
    engine.onError = reportError;
    engine.setSession(current.current);
    studio.setSession(current.current);
    studio.onRecordedNote = (pattern, note) =>
      change((d) => {
        d.patterns[pattern].notes.push(note);
      });
    const initialRevision = revision.current;
    let active = true;
    void restoreDraft(
      engine,
      () => active && revision.current === initialRevision,
    )
      .then((draft) => {
        if (active && draft && revision.current === initialRevision) {
          install(draft);
          metadata.current = draft.seratoCues ?? [];
          setStatus(
            "Local session restored. Press a pad or Play to enable audio.",
          );
        }
      })
      .catch(reportError);
    const timer = setInterval(() => {
      setAudio(engine.snapshot());
      setRuntime(studio.snapshot());
    }, 50);
    return () => {
      active = false;
      mounted.current = false;
      clearInterval(timer);
      midiAccess.current?.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
      queueMicrotask(() => {
        if (!mounted.current) {
          operation.current?.abort();
          studio.dispose();
          engine.dispose();
        }
      });
    };
  }, [change, engine, install, reportError, studio]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void persistState(state).catch(() => undefined);
    }, 700);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    const releaseAll = () => {
      for (const token of held.current.values()) studio.noteOff(token);
      held.current.clear();
    };
    const down = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      const a = actionsRef.current,
        v = currentView.current,
        s = current.current;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? a.redo() : a.undo();
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          a.saveSession();
        }
        if (e.key.toLowerCase() === "a" && v.mode === "sample") {
          e.preventDefault();
          setView({
            selection: s.cues.filter((c) => !c.empty).map((c) => c.id),
          });
        }
        return;
      }
      if (e.key === " ") {
        if (target?.closest("button")) return;
        e.preventDefault();
        if (v.mode === "sample")
          void (
            engine.snapshot().sourcePlaying
              ? Promise.resolve(engine.pauseSource())
              : engine.audition()
          ).catch(reportError);
        else {
          const runtime = studio.snapshot();
          if (runtime.playing) studio.stop();
          else
            void studio
              .play(
                v.mode === "song"
                  ? "song"
                  : v.mode === "perform"
                    ? "perform"
                    : "pattern",
              )
              .catch(reportError);
        }
        return;
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        v.mode === "sample"
      ) {
        e.preventDefault();
        change((d) => {
          for (const index of v.selection) d.cues[index] = blankCue(index);
        });
        return;
      }
      if (
        (e.key === "+" || e.key === "=" || e.key === "-") &&
        v.mode === "sample"
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("brainstorm:zoom", {
            detail: e.key === "-" ? -1 : 1,
          }),
        );
        return;
      }
      if (e.altKey || e.repeat) return;
      const index = typing.indexOf(e.key.toLowerCase());
      if (index < 0) return;
      e.preventDefault();
      const key = `key:${e.code}`;
      if (held.current.has(key)) return;
      const pad = s.keyboard ? (v.selection[0] ?? 0) : v.bank * 16 + index;
      held.current.set(key, a.padOn(pad, 1, s.keyboard ? index : 0));
    };
    const up = (e: KeyboardEvent) => {
      const key = `key:${e.code}`,
        token = held.current.get(key);
      if (token) {
        studio.noteOff(token);
        held.current.delete(key);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
      releaseAll();
    };
  }, [change, engine, reportError, setView, studio]);
  return (
    <div
      className="brain-storm-host"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          loadFile(e.dataTransfer.files[0]);
        }
      }}
    >
      <SamplerConsole
        state={state}
        view={view}
        setView={setView}
        change={change}
        beginGesture={beginGesture}
        endGesture={endGesture}
        engine={engine}
        studio={studio}
        audio={audio}
        runtime={runtime}
        actions={actions}
        busy={busy}
        progress={progress}
        status={status}
        reportError={reportError}
      />
    </div>
  );
}
