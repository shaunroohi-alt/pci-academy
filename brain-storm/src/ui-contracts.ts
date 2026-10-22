import type {
  AudioEngine,
  AudioSnapshot,
  StudioController,
  StudioSnapshot,
} from "./contracts";
import type { Mode, SampleModule, SessionState } from "./model";
export interface ViewState {
  mode: Mode;
  bank: 0 | 1;
  module: SampleModule;
  selection: number[];
  options: boolean;
}
export interface ConsoleActions {
  loadSource(): void;
  loadDemo(): void;
  eject(): void;
  openSession(): void;
  saveSession(): void;
  exportCue(): void;
  exportAll(): void;
  importAsset(): void;
  bouncePattern(): void;
  separateStems(): void;
  importStem(index: number): void;
  connectMidi(): void;
  recordMix(): void;
  padOn(pad: number, velocity?: number, pitch?: number): string;
  padOff(token: string): void;
  autoSet(
    mode: "find" | "slicer" | "random" | "keyshift" | "serato",
    size?: number,
  ): void;
  undo(): void;
  redo(): void;
  cancel(): void;
  canUndo: boolean;
  canRedo: boolean;
}
export interface ConsoleProps {
  state: SessionState;
  view: ViewState;
  setView(patch: Partial<ViewState>): void;
  change(edit: (draft: SessionState) => void, history?: boolean): void;
  beginGesture(): void;
  endGesture(): void;
  engine: AudioEngine;
  studio: StudioController;
  audio: AudioSnapshot;
  runtime: StudioSnapshot;
  reportError?: (error: unknown) => void;
  actions: ConsoleActions;
  busy: boolean;
  status: string;
  progress: number | null;
}
