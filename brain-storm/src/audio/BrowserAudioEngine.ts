import type { AudioEngine, AudioSnapshot, TriggerOptions } from "../contracts";
import {
  createSession,
  uid,
  type AssetInfo,
  type Cue,
  type SessionState,
  type SourceInfo,
} from "../model";
import type { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import processorUrl from "@soundtouchjs/audio-worklet/processor?url";
import { EffectRack } from "./effects";
import { decodeAiffPCM, encodeWav, estimateBpm, estimateKey } from "./pcm";

type SoundTouchConstructor =
  typeof import("@soundtouchjs/audio-worklet").SoundTouchNode;
const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
const db = (x: number) => 10 ** (clamp(x, -90, 24) / 20);
const MAX_FRAMES = 32000000;
interface Channel {
  input: GainNode;
  rack: EffectRack;
  pan: StereoPannerNode;
  gain: GainNode;
  sendA: GainNode;
  sendB: GainNode;
  meter: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}
interface Graph {
  channels: Channel[];
  masterRack: EffectRack;
  returnA: EffectRack;
  returnB: EffectRack;
  gain: GainNode;
  meter: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
  end: AudioNode;
  dispose(): void;
}
interface Voice {
  id: string;
  ordinal: number;
  pad: number;
  track: number;
  when: number;
  options: TriggerOptions;
  cue: Cue | null;
  state: SessionState;
  bufferId: string;
  assetOptions?: AssetPlay;
  cancelled: boolean;
  nodes: AudioNode[];
  sources: AudioBufferSourceNode[];
  stemGains: GainNode[];
  envelope?: GainNode;
  level?: GainNode;
  filter?: BiquadFilterNode;
  input?: GainNode;
  stretch?: SoundTouchNode;
  releaseAt?: number;
  releaseSeconds?: number;
  timer?: ReturnType<typeof setTimeout>;
  finished: number;
  audition: boolean;
  rate: number;
  offset: number;
  duration: number;
}
interface AssetPlay {
  time: number;
  offset: number;
  duration: number;
  rate: number;
  track: number;
  gain: number;
  loop: boolean;
}
const modules = new WeakMap<BaseAudioContext, Promise<SoundTouchConstructor>>();
async function registerStretch(
  context: BaseAudioContext,
): Promise<SoundTouchConstructor> {
  let ready = modules.get(context);
  if (!ready) {
    ready = import("@soundtouchjs/audio-worklet").then(
      async ({ SoundTouchNode }) => {
        await SoundTouchNode.register(context, processorUrl);
        return SoundTouchNode;
      },
    );
    modules.set(context, ready);
  }
  return ready;
}
function setParameter(
  param: AudioParam,
  value: number,
  context: BaseAudioContext,
  initial = false,
) {
  if (initial) param.setValueAtTime(value, context.currentTime);
  else param.setTargetAtTime(value, context.currentTime, 0.008);
}
function mixGraph(
  context: BaseAudioContext,
  state: SessionState,
  end: AudioNode,
): Graph {
  const masterRack = new EffectRack(context),
    returnA = new EffectRack(context),
    returnB = new EffectRack(context),
    gain = context.createGain(),
    meter = context.createAnalyser();
  meter.fftSize = 256;
  returnA.output.connect(masterRack.input);
  returnB.output.connect(masterRack.input);
  masterRack.output.connect(gain);
  gain.connect(meter);
  meter.connect(end);
  const channels = state.tracks.map(() => {
    const input = context.createGain(),
      rack = new EffectRack(context),
      pan = context.createStereoPanner(),
      gain = context.createGain(),
      sendA = context.createGain(),
      sendB = context.createGain(),
      meter = context.createAnalyser();
    meter.fftSize = 256;
    input.connect(rack.input);
    rack.output.connect(pan);
    pan.connect(gain);
    gain.connect(meter);
    meter.connect(masterRack.input);
    gain.connect(sendA);
    sendA.connect(returnA.input);
    gain.connect(sendB);
    sendB.connect(returnB.input);
    return {
      input,
      rack,
      pan,
      gain,
      sendA,
      sendB,
      meter,
      samples: new Float32Array(256),
    };
  });
  const graph: Graph = {
    channels,
    masterRack,
    returnA,
    returnB,
    gain,
    meter,
    samples: new Float32Array(256),
    end,
    dispose() {
      for (const channel of channels) {
        channel.rack.dispose();
        for (const n of [
          channel.input,
          channel.pan,
          channel.gain,
          channel.sendA,
          channel.sendB,
          channel.meter,
        ])
          n.disconnect();
      }
      masterRack.dispose();
      returnA.dispose();
      returnB.dispose();
      gain.disconnect();
      meter.disconnect();
    },
  };
  updateGraph(graph, context, state, true);
  return graph;
}
function updateGraph(
  graph: Graph,
  context: BaseAudioContext,
  state: SessionState,
  initial = false,
) {
  const solo = state.tracks.some((t) => t.solo);
  graph.channels.forEach((channel, i) => {
    const track = state.tracks[i];
    if (!track) return;
    const fade =
      track.cross === "a"
        ? Math.cos((clamp(state.crossfader, 0, 1) * Math.PI) / 2)
        : track.cross === "b"
          ? Math.sin((clamp(state.crossfader, 0, 1) * Math.PI) / 2)
          : 1;
    channel.rack.setSlots(track.effects);
    setParameter(channel.pan.pan, clamp(track.pan, -1, 1), context, initial);
    setParameter(
      channel.gain.gain,
      track.mute || (solo && !track.solo) ? 0 : db(track.gainDb) * fade,
      context,
      initial,
    );
    setParameter(
      channel.sendA.gain,
      clamp(track.sendA, 0, 1),
      context,
      initial,
    );
    setParameter(
      channel.sendB.gain,
      clamp(track.sendB, 0, 1),
      context,
      initial,
    );
  });
  graph.masterRack.setSlots(state.masterEffects);
  graph.returnA.setSlots(state.sendAEffects);
  graph.returnB.setSlots(state.sendBEffects);
  setParameter(graph.gain.gain, db(state.masterGainDb), context, initial);
}
function readPeak(node: AnalyserNode, scratch: Float32Array<ArrayBuffer>) {
  node.getFloatTimeDomainData(scratch);
  let peak = 0;
  for (const value of scratch) peak = Math.max(peak, Math.abs(value));
  return clamp(peak, 0, 1);
}

/** Native browser audio graph. Source files and recorded PCM stay on this device. */
export class BrowserAudioEngine implements AudioEngine {
  context: AudioContext | null = null;
  onError: ((error: Error) => void) | null = null;
  private state = createSession();
  private buffers = new Map<string, AudioBuffer>();
  private stems: (AudioBuffer | null)[] = [null, null, null, null];
  private stemsSourceId: string | null = null;
  private ready: Promise<void> | null = null;
  private graph: Graph | null = null;
  private disposed = false;
  private voices = new Map<string, Voice>();
  private stretchConstructor: SoundTouchConstructor | null = null;
  private voiceOrdinal = 0;
  private auditionId: string | null = null;
  private sourceHead = 0;
  private lastPitch = new Map<number, number>();
  private captureNode: AudioWorkletNode | null = null;
  private recording = false;
  private captureChunks: { left: Float32Array; right: Float32Array }[] = [];
  private captureFrames = 0;
  private captureError: Error | null = null;
  private stopCapture: ((value: void) => void) | null = null;
  private captureRequest = 0;
  private finalizing: Promise<Blob> | null = null;
  async initialize(): Promise<void> {
    if (this.disposed) throw new Error("This audio engine has been closed.");
    if (!this.ready) {
      const AudioContextClass =
        globalThis.AudioContext ||
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass)
        throw new Error("This browser does not support Web Audio.");
      const context = (this.context = new AudioContextClass({
        latencyHint: "interactive",
        sampleRate: 44100,
      }));
      // Resume is called in the same user gesture before asynchronous module loading.
      const resumed = context.resume();
      this.ready = (async () => {
        await resumed;
        if (!context.audioWorklet)
          throw new Error(
            "AudioWorklet requires a secure HTTPS page in a supported browser.",
          );
        this.stretchConstructor = await registerStretch(context);
        await context.audioWorklet.addModule(
          new URL("./capture-worklet.js", import.meta.url),
        );
        this.captureNode = new AudioWorkletNode(
          context,
          "brain-storm-capture",
          { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] },
        );
        this.captureNode.port.onmessage = ({ data }) =>
          this.receiveCapture(data);
        this.captureNode.connect(context.destination);
        this.graph = mixGraph(context, this.state, this.captureNode);
      })().catch(async (error) => {
        this.ready = null;
        this.context = null;
        try {
          await context.close();
        } catch {}
        throw error;
      });
    }
    await this.ready;
    if (this.context?.state === "suspended") await this.context.resume();
  }
  setSession(state: SessionState): void {
    const previous = this.state;
    const sourceChanged = previous.source?.assetId !== state.source?.assetId;
    const position = this.snapshot().sourceTime;
    this.state = state;
    if (sourceChanged) {
      this.stopVoices();
      this.auditionId = null;
      this.sourceHead = 0;
      if (this.stemsSourceId !== state.source?.assetId) {
        this.stems = [null, null, null, null];
        this.stemsSourceId = null;
      }
    }
    if (this.context && this.graph) {
      updateGraph(this.graph, this.context, state);
      for (const voice of this.voices.values())
        if (voice.envelope) this.updateVoice(voice);
    }
    if (!sourceChanged && this.auditionId) {
      const voice = this.voices.get(this.auditionId);
      if (voice) {
        this.sourceHead = position;
        voice.offset = position;
        voice.when = this.context?.currentTime ?? voice.when;
      }
    }
  }
  getBuffer(id: string) {
    return this.buffers.get(id);
  }
  getBuffers() {
    return this.buffers;
  }
  installBuffer(info: SourceInfo, buffer: AudioBuffer): void {
    if (
      buffer.numberOfChannels < 1 ||
      buffer.numberOfChannels > 2 ||
      buffer.length < 1 ||
      buffer.length > MAX_FRAMES ||
      buffer.sampleRate < 8000 ||
      buffer.sampleRate > 384000
    )
      throw new Error(
        "Audio must be mono/stereo, 8–384 kHz and no more than 32 million frames.",
      );
    this.buffers.set(info.assetId, buffer);
  }
  async loadSource(file: File): Promise<SourceInfo> {
    const buffer = await this.decode(file),
      info = this.sourceInfo(file.name, buffer);
    // Preparation is reversible: the caller can cancel before committing metadata.
    // setSession resets playback and stem bindings only when the source changes.
    this.installBuffer(info, buffer);
    return info;
  }
  async loadAsset(file: File, sourceBpm: number): Promise<AssetInfo> {
    const buffer = await this.decode(file),
      info = this.sourceInfo(file.name, buffer);
    this.installBuffer(info, buffer);
    const bpm = clamp(sourceBpm, 20, 999);
    return {
      ...info,
      sourceBpm: bpm,
      lengthBeats: (buffer.duration * bpm) / 60,
    };
  }
  private sourceInfo(name: string, buffer: AudioBuffer): SourceInfo {
    return {
      assetId: uid(),
      name,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      bpm: estimateBpm(buffer.getChannelData(0), buffer.sampleRate),
      key: estimateKey(buffer.getChannelData(0), buffer.sampleRate),
    };
  }
  private async decode(file: File): Promise<AudioBuffer> {
    await this.initialize();
    const context = this.context!;
    if (file.size > 512 * 1024 * 1024)
      throw new Error("Import an audio file smaller than 512 MB.");
    const data = await file.arrayBuffer();
    let buffer: AudioBuffer;
    const head = new Uint8Array(data, 0, Math.min(12, data.byteLength));
    if (String.fromCharCode(...head.slice(0, 4)) === "FORM") {
      const pcm = decodeAiffPCM(data);
      buffer = context.createBuffer(
        pcm.channels.length,
        pcm.channels[0].length,
        pcm.sampleRate,
      );
      pcm.channels.forEach((c, i) =>
        buffer.copyToChannel(new Float32Array(c), i),
      );
    } else {
      try {
        buffer = await context.decodeAudioData(data);
      } catch {
        throw new Error(
          "The browser could not decode this file. Import WAV, AIFF, MP3, FLAC or another format supported by your browser.",
        );
      }
    }
    if (
      buffer.numberOfChannels > 2 ||
      buffer.length > MAX_FRAMES ||
      !buffer.length
    )
      throw new Error(
        "Import mono or stereo audio with no more than 32 million frames.",
      );
    return buffer;
  }
  async loadDemo(): Promise<SourceInfo> {
    await this.initialize();
    const context = this.context!,
      rate = context.sampleRate,
      duration = 16,
      buffer = context.createBuffer(2, rate * duration, rate);
    for (let c = 0; c < 2; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i++) {
        const t = i / rate,
          beat = t * 2,
          kick = t % 0.5,
          snare = (t + 0.5) % 1,
          hat = t % 0.25,
          bar = Math.floor(t / 2) % 4;
        const root = [130.8128, 103.826, 155.5635, 116.5409][bar],
          noise = Math.sin(i * 178.37 + c * 19) * Math.sin(i * 0.731);
        const drums =
          0.5 *
            Math.sin(
              2 *
                Math.PI *
                (45 * kick + (40 * (1 - Math.exp(-kick * 25))) / 25),
            ) *
            Math.exp(-kick * 23) +
          0.2 * noise * Math.exp(-snare * 30) +
          0.045 * noise * Math.exp(-hat * 90);
        const chord =
          [1, 2 ** (3 / 12), 2 ** (7 / 12)].reduce(
            (s, r) => s + Math.sin(2 * Math.PI * root * r * t + c * 0.07),
            0,
          ) *
          0.055 *
          (0.7 + 0.3 * Math.sin(t * 1.1));
        channel[i] =
          drums +
          chord +
          0.08 *
            Math.sin(((2 * Math.PI * root) / 2) * t) *
            (0.5 + 0.5 * Math.exp(-kick * 6));
      }
    }
    const info: SourceInfo = {
      assetId: uid(),
      name: "Demo - Midnight Cuts",
      duration,
      sampleRate: rate,
      channels: 2,
      bpm: 120,
      key: "C minor",
    };
    this.installBuffer(info, buffer);
    return info;
  }
  setStems(
    buffers: (AudioBuffer | null)[],
    sourceId = this.state.source?.assetId,
  ): void {
    const source = sourceId ? this.buffers.get(sourceId) : undefined;
    if (buffers.length !== 4)
      throw new Error(
        "Supply four aligned stems: vocals, melody, bass and drums.",
      );
    for (const stem of buffers)
      if (
        stem &&
        source &&
        (stem.length !== source.length || stem.sampleRate !== source.sampleRate)
      )
        throw new Error(
          "Stem files must match the source sample rate and frame length.",
        );
    const currentSource = sourceId === this.state.source?.assetId;
    const restart =
      currentSource &&
      !!this.auditionId &&
      this.stems.every(Boolean) !== buffers.every(Boolean);
    const head = this.snapshot().sourceTime;
    if (restart) this.pauseSource();
    this.stems = [...buffers];
    this.stemsSourceId = sourceId ?? null;
    if (currentSource && this.context)
      for (const voice of this.voices.values())
        if (voice.envelope) this.updateVoice(voice);
    if (restart) {
      this.sourceHead = head;
      void this.audition().catch((e) => this.report(e));
    }
  }
  getStems() {
    return [...this.stems];
  }
  triggerCue(pad: number, options: TriggerOptions = {}): string {
    const cue = this.state.cues[pad],
      source = this.state.source;
    if (!cue || cue.empty || !source || !this.buffers.has(source.assetId))
      return "";
    const voice = this.makeVoice(pad, source.assetId, options, {
      ...cue,
      stemMute: [...cue.stemMute],
    });
    this.voices.set(voice.id, voice);
    void this.initialize()
      .then(() => this.startVoice(voice))
      .catch((error) => {
        this.removeVoice(voice);
        this.report(error);
      });
    return voice.id;
  }
  playAsset(id: string, options: AssetPlay): string {
    if (!this.buffers.has(id)) return "";
    const voice = this.makeVoice(
      -1,
      id,
      { time: options.time, track: options.track, gain: options.gain },
      null,
    );
    voice.assetOptions = options;
    this.voices.set(voice.id, voice);
    void this.initialize()
      .then(() => this.startVoice(voice))
      .catch((error) => {
        this.removeVoice(voice);
        this.report(error);
      });
    return voice.id;
  }
  private makeVoice(
    pad: number,
    bufferId: string,
    options: TriggerOptions,
    cue: Cue | null,
  ): Voice {
    return {
      id: uid(),
      ordinal: ++this.voiceOrdinal,
      pad,
      bufferId,
      track: Math.round(clamp(options.track ?? this.state.selectedTrack, 0, 7)),
      when: options.time ?? this.context?.currentTime ?? 0,
      options: { ...options },
      cue,
      state: this.state,
      cancelled: false,
      nodes: [],
      sources: [],
      stemGains: [],
      finished: 0,
      audition: false,
      rate: 1,
      offset: 0,
      duration: 0,
    };
  }
  private startVoice(voice: Voice): void {
    if (
      voice.cancelled ||
      !this.voices.has(voice.id) ||
      !this.context ||
      !this.graph
    )
      return;
    const context = this.context,
      buffer = this.buffers.get(voice.bufferId);
    if (!buffer) {
      this.removeVoice(voice);
      return;
    }
    voice.when = Math.max(context.currentTime + 0.001, voice.when);
    if (voice.releaseAt !== undefined && voice.releaseAt <= voice.when) {
      this.removeVoice(voice);
      return;
    }
    if (voice.cue && voice.state.mono && !voice.audition) {
      for (const previous of this.voices.values())
        if (
          previous !== voice &&
          previous.ordinal < voice.ordinal &&
          !previous.audition &&
          previous.pad >= 0 &&
          previous.track === voice.track &&
          previous.when <= voice.when
        )
          this.scheduleRelease(previous, voice.when, 0.005);
    }
    const eligible = [...this.voices.values()]
      .filter(
        (v) =>
          v !== voice &&
          v.ordinal < voice.ordinal &&
          !v.audition &&
          !v.cancelled &&
          v.when <= voice.when &&
          (v.releaseAt === undefined ||
            v.releaseAt + (v.releaseSeconds ?? (v.cue?.releaseMs ?? 0) / 1000) >
              voice.when) &&
          (!v.sources.length || v.finished < v.sources.length),
      )
      .sort((a, b) => a.ordinal - b.ordinal);
    while (eligible.length >= 32) {
      const oldest = eligible.shift()!;
      this.scheduleRelease(oldest, voice.when, 0.005);
    }
    const params = voice.assetOptions;
    const cue = voice.cue;
    const start = clamp(
      params?.offset ?? cue?.start ?? 0,
      0,
      Math.max(0, buffer.duration - 1 / buffer.sampleRate),
    );
    const end = cue
      ? clamp(
          cue.end > cue.start ? cue.end : buffer.duration,
          start + 1 / buffer.sampleRate,
          buffer.duration,
        )
      : buffer.duration;
    voice.offset = start;
    voice.duration = end - start;
    const envelope = context.createGain(),
      level = context.createGain(),
      filter = context.createBiquadFilter(),
      input = context.createGain();
    voice.envelope = envelope;
    voice.level = level;
    voice.filter = filter;
    voice.input = input;
    voice.nodes.push(envelope, level, filter, input);
    const pitch = this.voicePitch(voice),
      rate = params ? clamp(params.rate, 0.05, 16) : this.voiceRate(voice);
    voice.rate = rate;
    const oldPitch = this.lastPitch.get(voice.track) ?? pitch;
    const glide =
      !!cue &&
      voice.state.keyboard &&
      voice.state.mono &&
      voice.state.pitchTime &&
      voice.state.glideMs > 0 &&
      (voice.state.glideMode === "trigger" ||
        [...this.voices.values()].some(
          (v) => v !== voice && v.track === voice.track && v.pad >= 0,
        ));
    if (
      cue &&
      voice.state.pitchTime &&
      (Math.abs(pitch) > 0.0001 || Math.abs(rate - 1) > 0.0001 || glide)
    ) {
      const stretch = (voice.stretch = new this.stretchConstructor!({
        context,
      }));
      stretch.playbackRate.setValueAtTime(rate, voice.when);
      const semitones = clamp(pitch, -24, 24);
      stretch.pitch.setValueAtTime(2 ** ((pitch - semitones) / 12), voice.when);
      stretch.pitchSemitones.setValueAtTime(
        glide ? clamp(oldPitch, -24, 24) : semitones,
        voice.when,
      );
      if (glide)
        stretch.pitchSemitones.linearRampToValueAtTime(
          semitones,
          voice.when + voice.state.glideMs / 1000,
        );
      input.connect(stretch);
      stretch.connect(filter);
      voice.nodes.push(stretch);
    } else input.connect(filter);
    this.lastPitch.set(voice.track, pitch);
    filter.connect(level);
    level.connect(envelope);
    envelope.connect(this.graph.channels[voice.track].input);
    const attack = (cue?.attackMs ?? 0) / 1000;
    envelope.gain.setValueAtTime(attack > 0 ? 0 : 1, voice.when);
    if (attack > 0)
      envelope.gain.linearRampToValueAtTime(1, voice.when + attack);
    const stemReady =
      !!cue &&
      this.stems.every(Boolean) &&
      this.stemsSourceId === voice.bufferId &&
      voice.bufferId === this.state.source?.assetId;
    const inputBuffers = stemReady ? (this.stems as AudioBuffer[]) : [buffer];
    inputBuffers.forEach((audio, index) => {
      const source = context.createBufferSource(),
        stemGain = context.createGain();
      source.buffer = cue?.reverse
        ? this.reverseRegion(audio, start, end, context)
        : audio;
      source.playbackRate.setValueAtTime(rate, voice.when);
      source.loop = params?.loop ?? false;
      if (params?.loop) {
        source.loopStart = 0;
        source.loopEnd = audio.duration;
      }
      source.connect(stemGain);
      stemGain.connect(input);
      voice.sources.push(source);
      voice.stemGains.push(stemGain);
      voice.nodes.push(source, stemGain);
      source.onended = () => {
        voice.finished++;
        if (voice.finished === voice.sources.length) {
          if (voice.audition && this.auditionId === voice.id) {
            this.sourceHead = buffer.duration;
            this.auditionId = null;
          }
          voice.timer = setTimeout(() => this.removeVoice(voice), 300);
        }
      };
      if (cue?.reverse) source.start(voice.when, 0, end - start);
      else if (params?.loop) source.start(voice.when, start);
      else source.start(voice.when, start, end - start);
    });
    this.updateVoice(voice, true);
    if (params && voice.releaseAt === undefined)
      voice.releaseAt = voice.when + Math.max(0.001, params.duration);
    else if (
      voice.options.duration !== undefined &&
      voice.releaseAt === undefined
    )
      voice.releaseAt = voice.when + Math.max(0.001, voice.options.duration);
    if (voice.releaseAt !== undefined)
      this.scheduleRelease(voice, voice.releaseAt, voice.releaseSeconds);
  }
  private voiceRate(voice: Voice): number {
    const state = this.state,
      cu = state.cues[voice.pad] ?? voice.cue;
    const speed = clamp(
      (cu?.speed ?? 1) * (state.sync ? state.tempo / state.sourceBpm : 1),
      0.05,
      16,
    );
    return state.pitchTime
      ? speed
      : clamp(speed * 2 ** (this.voicePitch(voice) / 12), 0.0125, 64);
  }
  private voicePitch(voice: Voice): number {
    return clamp(
      (this.state.cues[voice.pad]?.pitch ?? voice.cue?.pitch ?? 0) +
        this.state.globalPitch +
        this.state.detune / 100 +
        (voice.options.pitch ?? 0),
      -60,
      60,
    );
  }
  private updateVoice(voice: Voice, initial = false): void {
    if (!this.context || !voice.level || !voice.filter) return;
    const cue = voice.pad >= 0 ? this.state.cues[voice.pad] : null;
    if (voice.pad >= 0 && (!cue || cue.empty)) {
      this.scheduleRelease(voice, this.context.currentTime, 0.005);
      return;
    }
    const velocity = this.state.velocity
      ? clamp(voice.options.velocity ?? 1, 0, 1)
      : 1;
    setParameter(
      voice.level.gain,
      db(cue?.gainDb ?? 0) * velocity * clamp(voice.options.gain ?? 1, 0, 8),
      this.context,
      initial,
    );
    const f = cue?.filter ?? 0.5;
    voice.filter.type = f > 0.5 ? "highpass" : "lowpass";
    const frequency =
      f < 0.5
        ? 30 * (20000 / 30) ** (f * 2)
        : f > 0.5
          ? 20 * (15000 / 20) ** ((f - 0.5) * 2)
          : this.context.sampleRate / 2;
    setParameter(
      voice.filter.frequency,
      clamp(frequency, 10, this.context.sampleRate / 2),
      this.context,
      initial,
    );
    voice.filter.Q.value = 0.707;
    voice.stemGains.forEach((gain, index) =>
      setParameter(
        gain.gain,
        voice.stemGains.length === 4 &&
          (this.state.stemMute[index] || cue?.stemMute[index])
          ? 0
          : 1,
        this.context!,
        initial,
      ),
    );
    if (voice.cue) {
      const rate = this.voiceRate(voice),
        pitch = this.voicePitch(voice),
        semitones = clamp(pitch, -24, 24);
      if (!initial && voice.input && voice.filter) {
        if (!this.state.pitchTime && voice.stretch) {
          voice.input.disconnect();
          voice.stretch.disconnect();
          voice.stretch.port.close();
          voice.nodes = voice.nodes.filter((n) => n !== voice.stretch);
          voice.stretch = undefined;
          voice.input.connect(voice.filter);
        }
        if (
          this.state.pitchTime &&
          !voice.stretch &&
          (Math.abs(pitch) > 0.0001 || Math.abs(rate - 1) > 0.0001)
        ) {
          voice.stretch = new this.stretchConstructor!({
            context: this.context,
          });
          voice.input.disconnect();
          voice.input.connect(voice.stretch);
          voice.stretch.connect(voice.filter);
          voice.nodes.push(voice.stretch);
        }
      }
      const update = (param: AudioParam, value: number) => {
        if (voice.when > this.context!.currentTime)
          param.setValueAtTime(value, voice.when);
        else setParameter(param, value, this.context!, initial);
      };
      voice.sources.forEach((s) => update(s.playbackRate, rate));
      voice.rate = rate;
      if (voice.stretch) {
        update(voice.stretch.playbackRate, rate);
        if (!initial) {
          update(voice.stretch.pitchSemitones, semitones);
          update(voice.stretch.pitch, 2 ** ((pitch - semitones) / 12));
        }
      }
    } else if (voice.assetOptions) {
      const asset = this.state.assets.find((a) => a.assetId === voice.bufferId);
      if (asset) {
        const rate = clamp(this.state.tempo / asset.sourceBpm, 0.05, 16);
        voice.sources.forEach((s) =>
          setParameter(s.playbackRate, rate, this.context!, initial),
        );
        voice.rate = rate;
      }
    }
  }
  private reverseRegion(
    source: AudioBuffer,
    start: number,
    end: number,
    context: BaseAudioContext,
  ): AudioBuffer {
    const offset = Math.floor(start * source.sampleRate),
      length = Math.max(
        1,
        Math.min(
          source.length - offset,
          Math.ceil((end - start) * source.sampleRate),
        ),
      );
    const reversed = context.createBuffer(
      source.numberOfChannels,
      length,
      source.sampleRate,
    );
    for (let c = 0; c < source.numberOfChannels; c++) {
      const input = source.getChannelData(c),
        output = reversed.getChannelData(c);
      for (let i = 0; i < length; i++)
        output[i] = input[offset + length - 1 - i];
    }
    return reversed;
  }
  releaseVoice(token: string, time?: number): void {
    const voice = this.voices.get(token);
    if (voice)
      this.scheduleRelease(voice, time ?? this.context?.currentTime ?? 0);
  }
  private scheduleRelease(
    voice: Voice,
    time: number,
    releaseSeconds?: number,
  ): void {
    if (voice.cancelled) return;
    const previousRelease = voice.releaseAt;
    voice.releaseAt = time;
    voice.releaseSeconds = releaseSeconds;
    if (!voice.envelope) {
      if (!this.context || time <= this.context.currentTime + 0.001) {
        voice.cancelled = true;
        this.voices.delete(voice.id);
      }
      return;
    }
    const context = this.context!;
    if (time <= voice.when && context.currentTime < voice.when) {
      this.removeVoice(voice);
      return;
    }
    const release =
        releaseSeconds ?? clamp((voice.cue?.releaseMs ?? 5) / 1000, 0.003, 10),
      at = Math.max(time, context.currentTime);
    const cancelFrom = Math.max(
      context.currentTime,
      Math.min(at, previousRelease ?? at),
    );
    if (typeof voice.envelope.gain.cancelAndHoldAtTime === "function")
      voice.envelope.gain.cancelAndHoldAtTime(cancelFrom);
    else {
      voice.envelope.gain.cancelScheduledValues(cancelFrom);
      voice.envelope.gain.setValueAtTime(1, cancelFrom);
    }
    const attackEnd = voice.when + (voice.cue?.attackMs ?? 0) / 1000;
    if (attackEnd > cancelFrom && attackEnd < at)
      voice.envelope.gain.linearRampToValueAtTime(1, attackEnd);
    if (at > cancelFrom) voice.envelope.gain.setValueAtTime(1, at);
    voice.envelope.gain.linearRampToValueAtTime(0, at + release);
    for (const source of voice.sources) {
      try {
        source.stop(at + release + 0.005);
      } catch {}
    }
  }
  private removeVoice(voice: Voice): void {
    voice.cancelled = true;
    if (voice.timer) clearTimeout(voice.timer);
    for (const source of voice.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
    }
    for (const node of voice.nodes)
      try {
        node.disconnect();
      } catch {}
    this.voices.delete(voice.id);
    if (this.auditionId === voice.id) this.auditionId = null;
  }
  stopVoices(): void {
    for (const voice of [...this.voices.values()]) this.removeVoice(voice);
    this.auditionId = null;
  }
  async audition(): Promise<void> {
    await this.initialize();
    if (this.auditionId) {
      this.pauseSource();
      return;
    }
    const info = this.state.source;
    if (!info || !this.buffers.has(info.assetId)) return;
    if (this.sourceHead >= info.duration - 0.001) this.sourceHead = 0;
    const cue: Cue = {
      ...this.state.cues[0],
      id: -1,
      start: this.sourceHead,
      end: info.duration,
      empty: false,
      gainDb: 0,
      filter: 0.5,
      attackMs: 0,
      releaseMs: 5,
      reverse: false,
      pitch: 0,
      speed: 1,
      stemMute: [false, false, false, false],
    };
    const voice = this.makeVoice(
      -1,
      info.assetId,
      { track: this.state.selectedTrack },
      cue,
    );
    voice.audition = true;
    this.auditionId = voice.id;
    this.voices.set(voice.id, voice);
    this.startVoice(voice);
  }
  pauseSource(): void {
    this.sourceHead = this.snapshot().sourceTime;
    if (this.auditionId) {
      const voice = this.voices.get(this.auditionId);
      if (voice) this.removeVoice(voice);
    }
    this.auditionId = null;
  }
  seekSource(time: number): void {
    const wasPlaying = !!this.auditionId;
    this.pauseSource();
    this.sourceHead = clamp(time, 0, this.state.source?.duration ?? 0);
    if (wasPlaying) void this.audition().catch((e) => this.report(e));
  }
  snapshot(): AudioSnapshot {
    const context = this.context,
      voice = this.auditionId ? this.voices.get(this.auditionId) : undefined;
    const sourceTime =
      voice && context
        ? clamp(
            voice.offset +
              Math.max(0, context.currentTime - voice.when) * voice.rate,
            0,
            this.state.source?.duration ?? 0,
          )
        : this.sourceHead;
    return {
      sourcePlaying: !!voice,
      sourceTime,
      activePads: [
        ...new Set(
          [...this.voices.values()]
            .filter(
              (v) =>
                !v.cancelled &&
                v.pad >= 0 &&
                !!v.envelope &&
                (!context || v.when <= context.currentTime) &&
                (v.releaseAt === undefined ||
                  !context ||
                  context.currentTime <
                    v.releaseAt +
                      (v.releaseSeconds ?? (v.cue?.releaseMs ?? 0) / 1000)),
            )
            .map((v) => v.pad),
        ),
      ],
      trackPeaks: this.graph
        ? this.graph.channels.map((c) => readPeak(c.meter, c.samples))
        : Array(8).fill(0),
      masterPeak: this.graph
        ? readPeak(this.graph.meter, this.graph.samples)
        : 0,
      recording: this.recording,
    };
  }
  private receiveCapture(data: {
    type: string;
    left?: ArrayBuffer;
    right?: ArrayBuffer;
    frames?: number;
    request?: number;
    message?: string;
  }) {
    if (data.type === "chunk" && data.left && data.right) {
      this.captureChunks.push({
        left: new Float32Array(data.left),
        right: new Float32Array(data.right),
      });
      this.captureFrames += data.frames ?? 0;
    }
    if (data.type === "stopped" && data.request === this.captureRequest) {
      this.stopCapture?.();
      this.stopCapture = null;
    }
    if (data.type === "error") {
      this.recording = false;
      this.captureError = new Error(data.message ?? "Audio recording failed.");
      this.report(this.captureError);
    }
  }
  async startRecording(): Promise<void> {
    await this.initialize();
    if (this.finalizing)
      throw new Error("Wait for the previous mix recording to finish.");
    if (this.recording) return;
    this.captureChunks = [];
    this.captureFrames = 0;
    this.captureError = null;
    this.recording = true;
    this.captureNode!.port.postMessage({
      type: "start",
      limit: Math.floor((256 * 1024 * 1024) / 8),
    });
  }
  stopRecording(): Promise<Blob> {
    if (this.finalizing) return this.finalizing;
    this.finalizing = this.finishRecording().finally(() => {
      this.finalizing = null;
    });
    return this.finalizing;
  }
  private async finishRecording(): Promise<Blob> {
    if (!this.captureNode) throw new Error("No mix recording is active.");
    this.recording = false;
    const request = ++this.captureRequest;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopCapture = null;
        reject(
          new Error(
            "The audio recorder did not finish. Resume audio and try again.",
          ),
        );
      }, 4000);
      this.stopCapture = () => {
        clearTimeout(timeout);
        resolve();
      };
      this.captureNode!.port.postMessage({ type: "stop", request });
    });
    if (this.captureError) {
      this.captureChunks = [];
      throw this.captureError;
    }
    if (!this.captureFrames)
      throw new Error("The recording contains no audio frames.");
    const channels = [
      new Float32Array(this.captureFrames),
      new Float32Array(this.captureFrames),
    ];
    let offset = 0;
    for (const chunk of this.captureChunks) {
      channels[0].set(chunk.left, offset);
      channels[1].set(chunk.right, offset);
      offset += chunk.left.length;
    }
    this.captureChunks = [];
    return encodeWav(channels, this.context!.sampleRate);
  }
  async exportCue(pad: number): Promise<Blob> {
    const cue = this.state.cues[pad],
      source = this.state.source
        ? this.buffers.get(this.state.source.assetId)
        : undefined;
    if (!cue || cue.empty || !source)
      throw new Error("Select an occupied cue to export.");
    const rate = clamp(
        cue.speed *
          (this.state.sync ? this.state.tempo / this.state.sourceBpm : 1),
        0.05,
        16,
      ),
      pitch = cue.pitch + this.state.globalPitch + this.state.detune / 100;
    const duration =
      (Math.max(cue.start, cue.end || source.duration) - cue.start) /
      (this.state.pitchTime ? rate : rate * 2 ** (pitch / 12));
    const buffer = await this.renderOffline(
      duration,
      async (context, graph, SoundTouch) => {
        this.scheduleOfflineCue(
          context,
          graph,
          SoundTouch,
          this.state,
          pad,
          0,
          this.state.selectedTrack,
          1,
          0,
          duration,
        );
      },
    );
    return encodeWav(
      Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c),
      ),
      buffer.sampleRate,
    );
  }
  async renderPattern(
    patternIndex: number,
    track: number,
  ): Promise<AudioBuffer> {
    const state = this.state,
      pattern = state.patterns[patternIndex];
    if (!pattern) throw new Error("Pattern not found.");
    const seconds = 60 / state.tempo,
      duration = pattern.length * seconds;
    return this.renderOffline(duration, async (context, graph, SoundTouch) => {
      const notes = [...pattern.notes].sort((a, b) => a.beat - b.beat);
      notes.forEach((note, index) => {
        const next = state.mono
          ? notes.slice(index + 1).find((n) => n.beat >= note.beat)
          : undefined;
        const end = Math.min(
          pattern.length,
          note.beat + note.duration,
          next?.beat ?? Infinity,
        );
        this.scheduleOfflineCue(
          context,
          graph,
          SoundTouch,
          state,
          note.pad,
          note.beat * seconds,
          track,
          note.velocity,
          note.pitch,
          Math.max(0.001, (end - note.beat) * seconds),
        );
      });
    });
  }
  private async renderOffline(
    duration: number,
    schedule: (
      context: OfflineAudioContext,
      graph: Graph,
      SoundTouch: SoundTouchConstructor,
    ) => Promise<void>,
  ): Promise<AudioBuffer> {
    await this.initialize();
    const rate = this.context!.sampleRate,
      frames = Math.ceil(duration * rate);
    if (frames < 1 || frames > MAX_FRAMES)
      throw new Error(
        "The rendered audio exceeds the browser limit of 32 million frames.",
      );
    const context = new OfflineAudioContext(2, frames, rate),
      SoundTouch = await registerStretch(context),
      graph = mixGraph(context, this.state, context.destination);
    try {
      await schedule(context, graph, SoundTouch);
      return await context.startRendering();
    } finally {
      graph.dispose();
    }
  }
  private scheduleOfflineCue(
    context: OfflineAudioContext,
    graph: Graph,
    SoundTouch: SoundTouchConstructor,
    state: SessionState,
    pad: number,
    time: number,
    track: number,
    velocity: number,
    pitchOffset: number,
    gate: number,
  ) {
    const cue = state.cues[pad],
      source = state.source
        ? this.buffers.get(state.source.assetId)
        : undefined;
    if (!cue || cue.empty || !source) return;
    const start = clamp(cue.start, 0, source.duration),
      end = clamp(
        cue.end > start ? cue.end : source.duration,
        start,
        source.duration,
      );
    if (end <= start) return;
    const input = context.createGain(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    let last: AudioNode = input;
    const pitch = clamp(
        cue.pitch + state.globalPitch + state.detune / 100 + pitchOffset,
        -60,
        60,
      ),
      baseRate = clamp(
        cue.speed * (state.sync ? state.tempo / state.sourceBpm : 1),
        0.05,
        16,
      ),
      rate = state.pitchTime ? baseRate : baseRate * 2 ** (pitch / 12);
    if (
      state.pitchTime &&
      (Math.abs(pitch) > 0.0001 || Math.abs(rate - 1) > 0.0001)
    ) {
      const stretch = new SoundTouch({ context });
      stretch.playbackRate.value = rate;
      const p = clamp(pitch, -24, 24);
      stretch.pitchSemitones.value = p;
      stretch.pitch.value = 2 ** ((pitch - p) / 12);
      last.connect(stretch);
      last = stretch;
    }
    const f = cue.filter;
    filter.type = f > 0.5 ? "highpass" : "lowpass";
    filter.frequency.value =
      f < 0.5
        ? 30 * (20000 / 30) ** (f * 2)
        : f > 0.5
          ? 20 * (15000 / 20) ** ((f - 0.5) * 2)
          : context.sampleRate / 2;
    filter.Q.value = 0.707;
    last.connect(filter);
    filter.connect(gain);
    gain.connect(graph.channels[Math.round(clamp(track, 0, 7))].input);
    const level = db(cue.gainDb) * (state.velocity ? clamp(velocity, 0, 1) : 1),
      attack = cue.attackMs / 1000,
      release = Math.min(
        cue.releaseMs / 1000,
        Math.max(0.003, (end - start) / rate),
      );
    gain.gain.setValueAtTime(attack > 0 ? 0 : level, time);
    if (attack > 0) gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.setValueAtTime(level, time + gate);
    gain.gain.linearRampToValueAtTime(0, time + gate + release);
    const buffers =
      this.stemsSourceId === state.source?.assetId && this.stems.every(Boolean)
        ? (this.stems as AudioBuffer[])
        : [source];
    buffers.forEach((buffer, i) => {
      if (buffers.length === 4 && (state.stemMute[i] || cue.stemMute[i]))
        return;
      const node = context.createBufferSource();
      node.buffer = cue.reverse
        ? this.reverseRegion(buffer, start, end, context)
        : buffer;
      node.playbackRate.value = rate;
      node.connect(input);
      node.start(time, cue.reverse ? 0 : start, end - start);
      node.stop(time + gate + release);
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopVoices();
    this.recording = false;
    this.captureError = new Error(
      "Audio engine closed before the recording finished.",
    );
    this.stopCapture?.();
    this.stopCapture = null;
    this.captureChunks = [];
    this.captureNode?.port.close();
    this.graph?.dispose();
    this.captureNode?.disconnect();
    this.buffers.clear();
    this.stems = [null, null, null, null];
    this.stemsSourceId = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.graph = null;
  }
  private report(value: unknown) {
    const error = value instanceof Error ? value : new Error(String(value));
    this.onError?.(error);
    if (!this.onError) console.error(error);
  }
}
export default BrowserAudioEngine;
