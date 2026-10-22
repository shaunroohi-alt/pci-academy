export type Mode = "sample" | "song" | "pattern" | "effects" | "perform";
export type SampleModule = "trim" | "tune" | "envelope" | "stems" | "grid";
export type PlayMode = "pattern" | "song" | "perform";
export type StemIndex = 0 | 1 | 2 | 3;
export type StemMask = [boolean, boolean, boolean, boolean];
export type EffectType =
  | "off"
  | "eq"
  | "compressor"
  | "saturation"
  | "bitcrush"
  | "chorus"
  | "delay"
  | "reverb"
  | "filter"
  | "tremolo"
  | "limiter"
  | "width"
  | "transient"
  | "flanger"
  | "phaser"
  | "tape";
export interface EffectSlot {
  type: EffectType;
  parameters: number[];
  mix: number;
  bypass: boolean;
}
export interface Cue {
  id: number;
  name: string;
  start: number;
  end: number;
  empty: boolean;
  colour: string;
  gainDb: number;
  filter: number;
  attackMs: number;
  releaseMs: number;
  reverse: boolean;
  favorite: boolean;
  pitch: number;
  speed: number;
  stemMute: StemMask;
}
export interface TempoMarker {
  time: number;
  bpm: number;
}
export interface SourceInfo {
  assetId: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bpm: number;
  key: string;
}
export interface AssetInfo extends SourceInfo {
  sourceBpm: number;
  lengthBeats: number;
}
export interface PatternNote {
  id: string;
  pad: number;
  beat: number;
  duration: number;
  velocity: number;
  pitch: number;
}
export interface Pattern {
  id: string;
  name: string;
  length: number;
  notes: PatternNote[];
}
export interface Track {
  id: number;
  name: string;
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  sendA: number;
  sendB: number;
  cross: "a" | "b" | "thru";
  effects: EffectSlot[];
}
export interface Clip {
  id: string;
  track: number;
  kind: "pattern" | "audio";
  contentId: string;
  beat: number;
  length: number;
  offset: number;
  loop: boolean;
  gain: number;
}
export interface LaunchSlot {
  kind: "pattern" | "audio";
  contentId: string;
}
export interface SessionState {
  seratoCues?: { index: number; time: number; name: string; colour: string }[];
  version: 1;
  name: string;
  source: SourceInfo | null;
  assets: AssetInfo[];
  cues: Cue[];
  sourceBpm: number;
  globalPitch: number;
  detune: number;
  sync: boolean;
  pitchTime: boolean;
  hold: boolean;
  mono: boolean;
  velocity: boolean;
  keyboard: boolean;
  glideMs: number;
  glideMode: "trigger" | "sustain";
  quantize: boolean;
  stemMute: StemMask;
  tempoMarkers: TempoMarker[];
  beatgrid: boolean;
  patterns: Pattern[];
  tracks: Track[];
  clips: Clip[];
  launchSlots: (LaunchSlot | null)[][];
  tempo: number;
  recordQuantize: number;
  launchQuantize: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  selectedPattern: number;
  selectedTrack: number;
  masterEffects: EffectSlot[];
  sendAEffects: EffectSlot[];
  sendBEffects: EffectSlot[];
  masterGainDb: number;
  crossfader: number;
}
export const cueColours = [
  "#cf6148",
  "#cc793e",
  "#c29549",
  "#a7a456",
  "#809f6b",
  "#6a9b8b",
  "#6d98a6",
  "#868eac",
];
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const blankEffect = (): EffectSlot => ({
  type: "off",
  parameters: [0, 0, 0, 0, 0, 0],
  mix: 1,
  bypass: false,
});
export const blankRack = () => Array.from({ length: 4 }, blankEffect);
export const blankCue = (id: number): Cue => ({
  id,
  name: `CUE ${id + 1}`,
  start: 0,
  end: 0,
  empty: true,
  colour: cueColours[Math.floor(id / 4) % 8],
  gainDb: 0,
  filter: 0.5,
  attackMs: 0,
  releaseMs: 10000,
  reverse: false,
  favorite: false,
  pitch: 0,
  speed: 1,
  stemMute: [false, false, false, false],
});
export function createSession(): SessionState {
  return {
    version: 1,
    seratoCues: [],
    name: "UNTITLED SESSION",
    source: null,
    assets: [],
    cues: Array.from({ length: 32 }, (_, i) => blankCue(i)),
    sourceBpm: 120,
    globalPitch: 0,
    detune: 0,
    sync: false,
    pitchTime: true,
    hold: true,
    mono: true,
    velocity: true,
    keyboard: false,
    glideMs: 0,
    glideMode: "trigger",
    quantize: false,
    stemMute: [false, false, false, false],
    tempoMarkers: [{ time: 0, bpm: 120 }],
    beatgrid: true,
    patterns: Array.from({ length: 16 }, (_, i) => ({
      id: `p${i}`,
      name: `Pattern ${i + 1}`,
      length: 16,
      notes: [],
    })),
    tracks: Array.from({ length: 8 }, (_, i) => ({
      id: i,
      name: [
        "DRUMS",
        "BASS",
        "CHORDS",
        "MELODY",
        "PERC",
        "TEXTURE",
        "VOCAL",
        "RETURN",
      ][i],
      gainDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      sendA: 0,
      sendB: 0,
      cross: "thru",
      effects: blankRack(),
    })),
    clips: [],
    launchSlots: Array.from({ length: 8 }, () =>
      Array.from({ length: 4 }, () => null),
    ),
    tempo: 120,
    recordQuantize: 0.25,
    launchQuantize: 4,
    loop: false,
    loopStart: 0,
    loopEnd: 64,
    selectedPattern: 0,
    selectedTrack: 0,
    masterEffects: blankRack(),
    sendAEffects: blankRack(),
    sendBEffects: blankRack(),
    masterGainDb: 0,
    crossfader: 0.5,
  };
}
export const cloneSession = (s: SessionState): SessionState =>
  structuredClone(s);
export const quantize = (beat: number, q: number) =>
  q > 0 ? Math.round(beat / q) * q : beat;
export function validateSession(value: unknown): SessionState {
  const s = value as SessionState;
  const fail = () => {
    throw new Error(
      "This session contains invalid or unsupported project data.",
    );
  };
  const number = (v: unknown, min: number, max: number, integer = false) => {
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < min ||
      v > max ||
      (integer && !Number.isInteger(v))
    )
      fail();
  };
  const text = (v: unknown, max = 1024) => {
    if (typeof v !== "string" || v.length > max) fail();
  };
  const bool = (v: unknown) => {
    if (typeof v !== "boolean") fail();
  };
  const mask = (v: unknown) => {
    if (!Array.isArray(v) || v.length !== 4) fail();
    (v as unknown[]).forEach(bool);
  };
  const types: EffectType[] = [
    "off",
    "eq",
    "compressor",
    "saturation",
    "bitcrush",
    "chorus",
    "delay",
    "reverb",
    "filter",
    "tremolo",
    "limiter",
    "width",
    "transient",
    "flanger",
    "phaser",
    "tape",
  ];
  const rack = (v: unknown) => {
    if (!Array.isArray(v) || v.length !== 4) fail();
    for (const slot of v as EffectSlot[]) {
      if (
        !slot ||
        !types.includes(slot.type) ||
        !Array.isArray(slot.parameters) ||
        slot.parameters.length > 6
      )
        fail();
      slot.parameters.forEach((p) => number(p, 0, 1));
      number(slot.mix, 0, 1);
      bool(slot.bypass);
    }
  };
  const source = (v: SourceInfo) => {
    if (!v) fail();
    text(v.assetId, 128);
    text(v.name);
    number(v.duration, 0.000001, 4000);
    number(v.sampleRate, 8000, 384000, true);
    number(v.channels, 1, 2, true);
    number(v.bpm, 20, 999);
    text(v.key, 128);
  };
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.cues) ||
    s.cues.length !== 32 ||
    !Array.isArray(s.patterns) ||
    s.patterns.length !== 16 ||
    !Array.isArray(s.tracks) ||
    s.tracks.length !== 8
  )
    fail();
  text(s.name);
  number(s.tempo, 20, 999);
  number(s.sourceBpm, 20, 999);
  number(s.globalPitch, -48, 48);
  number(s.detune, -100, 100);
  number(s.glideMs, 0, 10000);
  for (const v of [
    s.sync,
    s.pitchTime,
    s.hold,
    s.mono,
    s.velocity,
    s.keyboard,
    s.quantize,
    s.beatgrid,
    s.loop,
  ])
    bool(v);
  if (!["trigger", "sustain"].includes(s.glideMode)) fail();
  mask(s.stemMute);
  if (s.source !== null) source(s.source);
  if (!Array.isArray(s.assets) || s.assets.length > 64) fail();
  const assets = new Set<string>();
  for (const a of s.assets) {
    source(a);
    number(a.sourceBpm, 20, 999);
    number(a.lengthBeats, 0.000001, 1000000);
    if (assets.has(a.assetId) || a.assetId === s.source?.assetId) fail();
    assets.add(a.assetId);
  }
  for (const [index, c] of s.cues.entries()) {
    if (!c) fail();
    number(c.id, index, index, true);
    text(c.name);
    text(c.colour, 32);
    if (!/^#[a-fA-F0-9]{6}$/.test(c.colour)) fail();
    bool(c.empty);
    bool(c.reverse);
    bool(c.favorite);
    number(c.start, 0, s.source?.duration ?? 0);
    number(c.end, c.start, s.source?.duration ?? 0);
    if (!c.empty && (!s.source || c.end <= c.start)) fail();
    number(c.gainDb, -96, 24);
    number(c.filter, 0, 1);
    number(c.attackMs, 0, 10000);
    number(c.releaseMs, 0, 10000);
    number(c.pitch, -96, 96);
    number(c.speed, 0.05, 8);
    mask(c.stemMute);
  }
  if (!Array.isArray(s.tempoMarkers) || s.tempoMarkers.length > 128) fail();
  for (const m of s.tempoMarkers) {
    number(m.time, 0, s.source?.duration ?? 0);
    number(m.bpm, 20, 999);
  }
  const patternIds = new Set<string>();
  for (const p of s.patterns) {
    if (!p) fail();
    text(p.id, 128);
    text(p.name);
    if (
      patternIds.has(p.id) ||
      !Array.isArray(p.notes) ||
      p.notes.length > 32768
    )
      fail();
    patternIds.add(p.id);
    number(p.length, 1, 4096);
    const ids = new Set<string>();
    for (const n of p.notes) {
      if (!n) fail();
      text(n.id, 128);
      if (ids.has(n.id)) fail();
      ids.add(n.id);
      number(n.pad, 0, 31, true);
      number(n.beat, 0, p.length);
      number(n.duration, 0.000001, 4096);
      number(n.velocity, 0, 1);
      number(n.pitch, -96, 96);
    }
  }
  for (const [i, t] of s.tracks.entries()) {
    if (!t) fail();
    number(t.id, i, i, true);
    text(t.name);
    number(t.gainDb, -96, 24);
    number(t.pan, -1, 1);
    bool(t.mute);
    bool(t.solo);
    number(t.sendA, 0, 1);
    number(t.sendB, 0, 1);
    if (!["a", "b", "thru"].includes(t.cross)) fail();
    rack(t.effects);
  }
  rack(s.masterEffects);
  rack(s.sendAEffects);
  rack(s.sendBEffects);
  number(s.masterGainDb, -96, 24);
  number(s.crossfader, 0, 1);
  number(s.selectedPattern, 0, 15, true);
  number(s.selectedTrack, 0, 7, true);
  number(s.recordQuantize, 0, 16);
  number(s.launchQuantize, 0, 64);
  number(s.loopStart, 0, 1000000);
  number(s.loopEnd, s.loopStart + 0.000001, 1000000);
  const content = (c: { kind: string; contentId: string }) => {
    if (c.kind === "pattern") {
      if (!patternIds.has(c.contentId)) fail();
    } else if (c.kind === "audio") {
      if (!assets.has(c.contentId)) fail();
    } else fail();
  };
  if (!Array.isArray(s.clips) || s.clips.length > 32768) fail();
  const clipIds = new Set<string>();
  for (const c of s.clips) {
    if (!c) fail();
    text(c.id, 128);
    if (clipIds.has(c.id)) fail();
    clipIds.add(c.id);
    number(c.track, 0, 7, true);
    content(c);
    number(c.beat, 0, 1000000);
    number(c.length, 0.000001, 1000000);
    number(c.offset, 0, 1000000);
    number(c.gain, 0, 4);
    bool(c.loop);
  }
  if (!Array.isArray(s.launchSlots) || s.launchSlots.length !== 8) fail();
  for (const track of s.launchSlots) {
    if (!Array.isArray(track) || track.length !== 4) fail();
    for (const slot of track) if (slot !== null) content(slot);
  }
  if (s.seratoCues !== undefined) {
    if (!Array.isArray(s.seratoCues) || s.seratoCues.length > 32) fail();
    const ids = new Set<number>();
    for (const c of s.seratoCues) {
      number(c.index, 0, 31, true);
      if (ids.has(c.index)) fail();
      ids.add(c.index);
      number(c.time, 0, s.source?.duration ?? 0);
      text(c.name);
      text(c.colour, 32);
    }
  }
  return s;
}
