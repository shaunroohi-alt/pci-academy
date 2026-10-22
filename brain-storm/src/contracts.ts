import type {
  SessionState,
  SourceInfo,
  AssetInfo,
  PlayMode,
  PatternNote,
} from "./model";
export interface TriggerOptions {
  time?: number;
  velocity?: number;
  pitch?: number;
  track?: number;
  gain?: number;
  duration?: number;
}
export interface AudioSnapshot {
  sourcePlaying: boolean;
  sourceTime: number;
  activePads: number[];
  trackPeaks: number[];
  masterPeak: number;
  recording: boolean;
}
export interface AudioEngine {
  readonly context: AudioContext | null;
  initialize(): Promise<void>;
  dispose(): void;
  setSession(state: SessionState): void;
  loadSource(file: File): Promise<SourceInfo>;
  loadAsset(file: File, sourceBpm: number): Promise<AssetInfo>;
  loadDemo(): Promise<SourceInfo>;
  getBuffer(id: string): AudioBuffer | undefined;
  installBuffer(info: SourceInfo, buffer: AudioBuffer): void;
  getBuffers(): Map<string, AudioBuffer>;
  triggerCue(pad: number, options?: TriggerOptions): string;
  releaseVoice(token: string, time?: number): void;
  stopVoices(): void;
  playAsset(
    id: string,
    options: {
      time: number;
      offset: number;
      duration: number;
      rate: number;
      track: number;
      gain: number;
      loop: boolean;
    },
  ): string;
  audition(): Promise<void>;
  pauseSource(): void;
  seekSource(time: number): void;
  snapshot(): AudioSnapshot;
  setStems(buffers: (AudioBuffer | null)[], sourceId?: string): void;
  getStems(): (AudioBuffer | null)[];
  startRecording(): Promise<void>;
  stopRecording(): Promise<Blob>;
  exportCue(pad: number): Promise<Blob>;
  renderPattern(pattern: number, track: number): Promise<AudioBuffer>;
}
export interface StudioSnapshot {
  playing: boolean;
  recordingNotes: boolean;
  mode: PlayMode;
  beat: number;
  activeScene: number[];
  pendingScene: number[];
}
export interface StudioController {
  setSession(state: SessionState): void;
  play(mode: PlayMode): Promise<void>;
  stop(): void;
  seek(beat: number): void;
  armNotes(value: boolean): void;
  noteOn(pad: number, velocity?: number, pitch?: number): string;
  noteOff(token: string): void;
  launch(track: number, scene: number): Promise<void>;
  launchScene(scene: number): Promise<void>;
  stopTrack(track: number): void;
  snapshot(): StudioSnapshot;
  dispose(): void;
  onRecordedNote: ((pattern: number, note: PatternNote) => void) | null;
}
export interface StemProgress {
  progress: number;
  message: string;
}
export interface StemService {
  separate(
    buffer: AudioBuffer,
    onProgress: (p: StemProgress) => void,
    signal: AbortSignal,
  ): Promise<AudioBuffer[]>;
}
