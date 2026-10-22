export interface StemRequest {
  moduleUrl: string;
  manifestUrl: string;
  sampleRate: number;
  frames: number;
  channels: Float32Array[];
}
export type StemResponse =
  | {type: 'progress'; progress: number; message: string}
  | {type: 'complete'; channels: Float32Array[][]; sampleRate: number; frames: number; inferred: boolean}
  | {type: 'error'; message: string};
