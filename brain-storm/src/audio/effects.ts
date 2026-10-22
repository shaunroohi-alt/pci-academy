import type { EffectSlot, EffectType } from "../model";

/** The browser rack uses normalized stored parameters and displays their actual DSP units. */
export interface EffectParameter {
  name: string;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  format(value: number): string;
}
export interface EffectDefinition {
  name: string;
  description: string;
  parameters: EffectParameter[];
  defaults: number[];
}
const clamp = (n: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
const linear = (n: number, lo: number, hi: number) => lo + clamp(n) * (hi - lo);
const logarithmic = (n: number, lo: number, hi: number) =>
  lo * Math.pow(hi / lo, clamp(n));
const db = (n: number) => Math.pow(10, n / 20);
const p = (
  name: string,
  initial: number,
  unit: string,
  convert: (n: number) => number,
  decimals = 1,
): EffectParameter => ({
  name,
  min: 0,
  max: 1,
  defaultValue: initial,
  unit,
  format: (n) =>
    `${convert(clamp(n)).toFixed(decimals)}${unit ? ` ${unit}` : ""}`,
});
const percent = (name: string, initial: number) =>
  p(name, initial, "%", (n) => n * 100, 0);
const definition = (
  name: string,
  description: string,
  parameters: EffectParameter[],
): EffectDefinition => ({
  name,
  description,
  parameters,
  defaults: parameters.map((v) => v.defaultValue),
});
export const effectDefinitions: Record<EffectType, EffectDefinition> = {
  off: definition("Off", "Unprocessed signal", []),
  eq: definition(
    "Three-band EQ",
    "Low shelf, variable mid band and high shelf",
    [
      p("Low", 0.5, "dB", (n) => linear(n, -18, 18)),
      p("Mid", 0.5, "dB", (n) => linear(n, -18, 18)),
      p("High", 0.5, "dB", (n) => linear(n, -18, 18)),
      p("Mid frequency", 0.5, "Hz", (n) => logarithmic(n, 100, 10000), 0),
      p("Mid Q", 0.3, "", (n) => logarithmic(n, 0.2, 8), 2),
      p("Output", 0.5, "dB", (n) => linear(n, -12, 12)),
    ],
  ),
  compressor: definition(
    "Compressor",
    "Dynamics compression with attack, release and makeup",
    [
      p("Threshold", 0.6, "dB", (n) => linear(n, -60, 0)),
      p("Ratio", 0.4, ":1", (n) => linear(n, 1, 20)),
      p("Attack", 0.35, "ms", (n) => logarithmic(n, 0.2, 200)),
      p("Release", 0.5, "ms", (n) => logarithmic(n, 20, 1500)),
      p("Knee", 0.5, "dB", (n) => linear(n, 0, 40)),
      p("Makeup", 0.5, "dB", (n) => linear(n, -12, 12)),
    ],
  ),
  saturation: definition(
    "Saturation",
    "Oversampled soft clipping with bias and tone control",
    [
      p("Drive", 0.3, "dB", (n) => linear(n, 0, 30)),
      p("Tone", 0.8, "Hz", (n) => logarithmic(n, 500, 20000), 0),
      p("Bias", 0.5, "", (n) => linear(n, -0.25, 0.25), 2),
      p("Output", 0.5, "dB", (n) => linear(n, -18, 6)),
    ],
  ),
  bitcrush: definition(
    "Bit crusher",
    "Quantized amplitude and restricted bandwidth",
    [
      p("Resolution", 0.65, "bit", (n) => Math.round(linear(n, 2, 16)), 0),
      p("Bandwidth", 0.8, "Hz", (n) => logarithmic(n, 300, 20000), 0),
      p("Drive", 0.25, "dB", (n) => linear(n, 0, 24)),
      p("Output", 0.5, "dB", (n) => linear(n, -18, 6)),
    ],
  ),
  chorus: definition(
    "Chorus",
    "Two modulated delay lines with stereo movement",
    [
      p("Rate", 0.3, "Hz", (n) => logarithmic(n, 0.05, 5), 2),
      p("Depth", 0.45, "ms", (n) => linear(n, 0.1, 12)),
      p("Delay", 0.5, "ms", (n) => linear(n, 12, 40)),
      percent("Feedback", 0.15),
      percent("Width", 0.8),
    ],
  ),
  delay: definition(
    "Stereo delay",
    "Cross-fed stereo echoes with filtered feedback",
    [
      p("Time", 0.3, "ms", (n) => logarithmic(n, 20, 1500), 0),
      percent("Feedback", 0.4),
      p("Tone", 0.75, "Hz", (n) => logarithmic(n, 300, 18000), 0),
      p("Spread", 0.35, "ms", (n) => linear(n, 0, 40)),
      p("Output", 0.5, "dB", (n) => linear(n, -18, 6)),
    ],
  ),
  reverb: definition(
    "Reverb",
    "Deterministic stereo convolution room with predelay",
    [
      p("Size", 0.35, "s", (n) => linear(n, 0.15, 5), 2),
      p("Decay", 0.45, "", (n) => linear(n, 1.2, 7), 2),
      p("Damping", 0.7, "Hz", (n) => logarithmic(n, 300, 18000), 0),
      p("Predelay", 0.1, "ms", (n) => linear(n, 0, 150), 0),
      p("Output", 0.5, "dB", (n) => linear(n, -18, 6)),
    ],
  ),
  filter: definition(
    "Resonant filter",
    "Continuously moves from low-pass through open to high-pass",
    [
      p("Cutoff", 0.5, "", (n) => n, 2),
      p("Resonance", 0.1, "Q", (n) => logarithmic(n, 0.5, 15), 2),
      p("Drive", 0, "dB", (n) => linear(n, 0, 18)),
      p("Output", 0.5, "dB", (n) => linear(n, -12, 12)),
    ],
  ),
  tremolo: definition(
    "Tremolo",
    "Amplitude modulation with selectable waveform",
    [
      p("Rate", 0.4, "Hz", (n) => logarithmic(n, 0.1, 20), 2),
      percent("Depth", 0.65),
      {
        ...percent("Shape", 0),
        format: (n) =>
          ["Sine", "Triangle", "Square", "Sawtooth"][
            Math.min(3, Math.floor(clamp(n) * 4))
          ],
      },
    ],
  ),
  limiter: definition(
    "Limiter",
    "Fast high-ratio peak control with output ceiling",
    [
      p("Threshold", 0.75, "dB", (n) => linear(n, -24, 0)),
      p("Release", 0.4, "ms", (n) => logarithmic(n, 10, 500)),
      p("Ceiling", 0.8, "dB", (n) => linear(n, -6, 0)),
      p("Input", 0.2, "dB", (n) => linear(n, 0, 18)),
    ],
  ),
  width: definition(
    "Stereo width",
    "Mid/side width matrix with mono-compatible low frequencies",
    [
      percent("Width", 0.5),
      p("Bass mono", 0.25, "Hz", (n) => logarithmic(n, 20, 500), 0),
      p("Mid", 0.5, "dB", (n) => linear(n, -12, 12)),
      p("Side", 0.5, "dB", (n) => linear(n, -12, 12)),
    ],
  ),
  transient: definition(
    "Transient shaper",
    "Attack and body shaping with parallel dynamics",
    [
      p("Attack", 0.55, "ms", (n) => logarithmic(n, 0.2, 100)),
      p("Body", 0.5, "dB", (n) => linear(n, -12, 12)),
      p("Release", 0.45, "ms", (n) => logarithmic(n, 20, 800)),
      p("Sensitivity", 0.6, "dB", (n) => linear(n, -48, -6)),
      p("Presence", 0.5, "dB", (n) => linear(n, -12, 12)),
    ],
  ),
  flanger: definition(
    "Flanger",
    "Short modulated stereo delay with resonant feedback",
    [
      p("Rate", 0.25, "Hz", (n) => logarithmic(n, 0.03, 5), 2),
      p("Depth", 0.6, "ms", (n) => linear(n, 0.05, 3)),
      p("Delay", 0.5, "ms", (n) => linear(n, 0.2, 6)),
      percent("Feedback", 0.5),
      percent("Width", 0.65),
    ],
  ),
  phaser: definition(
    "Phaser",
    "Six swept all-pass stages with delayed feedback",
    [
      p("Rate", 0.3, "Hz", (n) => logarithmic(n, 0.05, 8), 2),
      percent("Depth", 0.6),
      p("Center", 0.45, "Hz", (n) => logarithmic(n, 100, 6000), 0),
      percent("Feedback", 0.35),
    ],
  ),
  tape: definition(
    "Tape colour",
    "Soft saturation, wow/flutter delay, hiss and high-frequency rolloff",
    [
      p("Drive", 0.3, "dB", (n) => linear(n, 0, 18)),
      percent("Wow", 0.25),
      percent("Flutter", 0.15),
      p("Hiss", 0, "dB", (n) => linear(n, -90, -40), 0),
      p("Tone", 0.75, "Hz", (n) => logarithmic(n, 1000, 20000), 0),
      p("Output", 0.5, "dB", (n) => linear(n, -12, 6)),
    ],
  ),
};
export function formatParameterValue(
  type: EffectType,
  index: number,
  value: number,
): string {
  const parameter = effectDefinitions[type]?.parameters[index];
  if (type === "filter" && index === 0)
    return value < 0.48
      ? `LP ${Math.round(logarithmic(value / 0.48, 40, 20000))} Hz`
      : value > 0.52
        ? `HP ${Math.round(logarithmic((value - 0.52) / 0.48, 20, 12000))} Hz`
        : "OPEN";
  if (type === "width" && index === 0)
    return `${Math.round(clamp(value) * 200)} %`;
  if ((type === "chorus" || type === "flanger") && index === 3)
    return `${Math.round(clamp(value) * 80)} %`;
  if (type === "delay" && index === 1)
    return `${Math.round(clamp(value) * 92)} %`;
  if (type === "phaser" && index === 3)
    return `${Math.round(clamp(value) * 70)} %`;
  return parameter ? parameter.format(value) : "";
}

interface Processor {
  input: GainNode;
  output: GainNode;
  update(values: number[]): void;
  dispose(): void;
}
const setParam = (
  context: BaseAudioContext,
  target: AudioParam,
  value: number,
) => {
  const v = Number.isFinite(value)
    ? Math.max(target.minValue, Math.min(target.maxValue, value))
    : target.defaultValue;
  if (context.state === "running") {
    target.cancelScheduledValues(context.currentTime);
    target.setTargetAtTime(v, context.currentTime, 0.008);
  } else target.value = v;
};
const valuesFor = (type: EffectType, values: number[]) =>
  effectDefinitions[type].parameters.map((parameter, index) =>
    Number.isFinite(values[index])
      ? clamp(values[index])
      : parameter.defaultValue,
  );
function makeProcessor(context: BaseAudioContext, type: EffectType): Processor {
  const nodes: AudioNode[] = [],
    oscillators: OscillatorNode[] = [],
    buffers: AudioBufferSourceNode[] = [];
  const keep = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const gain = (initial = 1) => {
    const n = keep(context.createGain());
    n.gain.value = initial;
    return n;
  };
  const filter = (kind: BiquadFilterType, freq = 1000, q = 0.707) => {
    const n = keep(context.createBiquadFilter());
    n.type = kind;
    n.frequency.value = Math.min(context.sampleRate * 0.45, freq);
    n.Q.value = q;
    return n;
  };
  const delay = (seconds = 0.01) => {
    const n = keep(context.createDelay(4));
    n.delayTime.value = seconds;
    return n;
  };
  const oscillator = (frequency: number) => {
    const n = keep(context.createOscillator());
    n.frequency.value = frequency;
    oscillators.push(n);
    n.start();
    return n;
  };
  const link = (...list: AudioNode[]) => {
    for (let i = 1; i < list.length; i++) list[i - 1].connect(list[i]);
  };
  const input = gain(),
    output = gain();
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  const set = (target: AudioParam, v: number) => setParam(context, target, v);
  const hz = (v: number) => Math.min(context.sampleRate * 0.45, v);
  let update: (values: number[]) => void = () => {};
  if (type === "eq") {
    const low = filter("lowshelf", 180),
      mid = filter("peaking"),
      high = filter("highshelf", 6500),
      trim = gain();
    link(input, low, mid, high, trim, output);
    update = (v) => {
      set(low.gain, linear(v[0], -18, 18));
      set(mid.gain, linear(v[1], -18, 18));
      set(high.gain, linear(v[2], -18, 18));
      set(mid.frequency, hz(logarithmic(v[3], 100, 10000)));
      set(mid.Q, logarithmic(v[4], 0.2, 8));
      set(trim.gain, db(linear(v[5], -12, 12)));
    };
  } else if (
    type === "compressor" ||
    type === "limiter" ||
    type === "transient"
  ) {
    const pre = gain(),
      comp = keep(context.createDynamicsCompressor()),
      post = gain(),
      presence = filter("highshelf", 3000);
    link(input, pre, comp, presence, post, output);
    if (type === "compressor")
      update = (v) => {
        set(comp.threshold, linear(v[0], -60, 0));
        set(comp.ratio, linear(v[1], 1, 20));
        set(comp.attack, logarithmic(v[2], 0.2, 200) / 1000);
        set(comp.release, logarithmic(v[3], 20, 1500) / 1000);
        set(comp.knee, linear(v[4], 0, 40));
        set(post.gain, db(linear(v[5], -12, 12)));
      };
    if (type === "limiter")
      update = (v) => {
        set(comp.threshold, linear(v[0], -24, 0));
        set(comp.ratio, 20);
        set(comp.attack, 0.001);
        set(comp.release, logarithmic(v[1], 10, 500) / 1000);
        set(comp.knee, 0);
        set(pre.gain, db(linear(v[3], 0, 18)));
        set(post.gain, db(linear(v[2], -6, 0)));
      };
    if (type === "transient")
      update = (v) => {
        set(comp.attack, logarithmic(v[0], 0.2, 100) / 1000);
        set(comp.release, logarithmic(v[2], 20, 800) / 1000);
        set(comp.threshold, linear(v[3], -48, -6));
        set(comp.ratio, 4);
        set(comp.knee, 6);
        set(post.gain, db(linear(v[1], -12, 12)));
        set(presence.gain, linear(v[4], -12, 12));
      };
  } else if (type === "saturation" || type === "bitcrush") {
    const shape = keep(context.createWaveShaper()),
      tone = filter("lowpass", 18000),
      trim = gain();
    shape.oversample = type === "saturation" ? "2x" : "none";
    link(input, shape, tone, trim, output);
    let lastCurve = "";
    update = (v) => {
      const key = type === "saturation" ? `${v[0]}:${v[2]}` : `${v[0]}:${v[2]}`;
      if (key !== lastCurve) {
        const curve = new Float32Array(8192);
        const drive = db(
          linear(
            type === "saturation" ? v[0] : v[2],
            0,
            type === "saturation" ? 30 : 24,
          ),
        );
        const bias = type === "saturation" ? linear(v[2], -0.25, 0.25) : 0;
        const levels = Math.pow(2, Math.round(linear(v[0], 2, 16)) - 1);
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] =
            type === "saturation"
              ? Math.tanh((x + bias) * drive) - Math.tanh(bias * drive)
              : Math.round(clamp(x * drive, -1, 1) * levels) / levels;
        }
        shape.curve = curve;
        lastCurve = key;
      }
      set(
        tone.frequency,
        hz(logarithmic(v[1], type === "saturation" ? 500 : 300, 20000)),
      );
      set(trim.gain, db(linear(v[3], -18, 6)));
    };
  } else if (type === "filter") {
    const pre = gain(),
      low = filter("lowpass", 20000),
      high = filter("highpass", 20),
      trim = gain();
    link(input, pre, low, high, trim, output);
    update = (v) => {
      const cutoff = clamp(v[0]);
      set(
        low.frequency,
        hz(cutoff < 0.48 ? logarithmic(cutoff / 0.48, 40, 20000) : 20000),
      );
      set(
        high.frequency,
        hz(cutoff > 0.52 ? logarithmic((cutoff - 0.52) / 0.48, 20, 12000) : 20),
      );
      set(low.Q, logarithmic(v[1], 0.5, 15));
      set(high.Q, logarithmic(v[1], 0.5, 15));
      set(pre.gain, db(linear(v[2], 0, 18)));
      set(trim.gain, db(linear(v[3], -12, 12)));
    };
  } else if (type === "delay") {
    const split = keep(context.createChannelSplitter(2)),
      merge = keep(context.createChannelMerger(2)),
      left = delay(0.3),
      right = delay(0.32),
      feedbackL = gain(0.3),
      feedbackR = gain(0.3),
      toneL = filter("lowpass", 8000),
      toneR = filter("lowpass", 8000),
      trim = gain();
    input.connect(split);
    split.connect(left, 0);
    split.connect(right, 1);
    left.connect(merge, 0, 0);
    right.connect(merge, 0, 1);
    link(left, toneL, feedbackL, right);
    link(right, toneR, feedbackR, left);
    link(merge, trim, output);
    update = (v) => {
      const time = logarithmic(v[0], 20, 1500) / 1000;
      set(left.delayTime, time);
      set(right.delayTime, time + linear(v[3], 0, 40) / 1000);
      set(feedbackL.gain, clamp(v[1]) * 0.92);
      set(feedbackR.gain, clamp(v[1]) * 0.92);
      set(toneL.frequency, hz(logarithmic(v[2], 300, 18000)));
      set(toneR.frequency, hz(logarithmic(v[2], 300, 18000)));
      set(trim.gain, db(linear(v[4], -18, 6)));
    };
  } else if (type === "chorus" || type === "flanger") {
    const split = keep(context.createChannelSplitter(2)),
      merge = keep(context.createChannelMerger(2)),
      left = delay(0.02),
      right = delay(0.025),
      feedbackL = gain(),
      feedbackR = gain(),
      dry = gain(0.5),
      wet = gain(0.5);
    const lfoL = oscillator(0.5),
      lfoR = oscillator(0.503),
      modL = gain(0.002),
      modR = gain(0.002);
    input.connect(split);
    split.connect(left, 0);
    split.connect(right, 1);
    left.connect(merge, 0, 0);
    right.connect(merge, 0, 1);
    link(left, feedbackL, left);
    link(right, feedbackR, right);
    link(input, dry, output);
    link(merge, wet, output);
    link(lfoL, modL);
    modL.connect(left.delayTime);
    link(lfoR, modR);
    modR.connect(right.delayTime);
    update = (v) => {
      const flanging = type === "flanger";
      const base = linear(v[2], flanging ? 0.2 : 12, flanging ? 6 : 40) / 1000;
      const depth = Math.min(
        base * 0.85,
        linear(v[1], flanging ? 0.05 : 0.1, flanging ? 3 : 12) / 1000,
      );
      const rate = logarithmic(v[0], flanging ? 0.03 : 0.05, 5);
      set(left.delayTime, base);
      set(right.delayTime, base + clamp(v[4]) * (flanging ? 0.0003 : 0.003));
      set(modL.gain, depth);
      set(modR.gain, depth);
      set(lfoL.frequency, rate);
      set(lfoR.frequency, rate * (1 + clamp(v[4]) * 0.015));
      set(feedbackL.gain, clamp(v[3]) * 0.8);
      set(feedbackR.gain, clamp(v[3]) * 0.8);
    };
  } else if (type === "phaser") {
    const stages = Array.from({ length: 6 }, (_, i) =>
        filter("allpass", 300 * (i + 1), 0.7),
      ),
      dry = gain(0.5),
      wet = gain(0.5),
      feedback = gain(0.2),
      safeDelay = delay(0.001),
      lfo = oscillator(0.5),
      mods = stages.map(() => gain(100));
    link(input, ...stages, wet, output);
    link(input, dry, output);
    link(stages[stages.length - 1], safeDelay, feedback, stages[0]);
    stages.forEach((stage, i) => {
      lfo.connect(mods[i]);
      mods[i].connect(stage.frequency);
    });
    update = (v) => {
      const center = logarithmic(v[2], 100, 6000);
      set(lfo.frequency, logarithmic(v[0], 0.05, 8));
      set(feedback.gain, clamp(v[3]) * 0.7);
      stages.forEach((stage, i) => {
        const frequency = hz(center * Math.pow(1.35, i - 2.5));
        set(stage.frequency, frequency);
        set(
          mods[i].gain,
          Math.min(frequency * 0.85, frequency * clamp(v[1]) * 0.85),
        );
      });
    };
  } else if (type === "tremolo") {
    const amp = gain(),
      lfo = oscillator(3),
      depth = gain(0.3);
    link(input, amp, output);
    lfo.connect(depth);
    depth.connect(amp.gain);
    update = (v) => {
      set(lfo.frequency, logarithmic(v[0], 0.1, 20));
      set(amp.gain, 1 - clamp(v[1]) * 0.5);
      set(depth.gain, clamp(v[1]) * 0.5);
      lfo.type = (
        ["sine", "triangle", "square", "sawtooth"] as OscillatorType[]
      )[Math.min(3, Math.floor(clamp(v[2]) * 4))];
    };
  } else if (type === "width") {
    const split = keep(context.createChannelSplitter(2)),
      merge = keep(context.createChannelMerger(2)),
      mid = gain(),
      side = gain(),
      midL = gain(0.5),
      midR = gain(0.5),
      sideL = gain(0.5),
      sideR = gain(-0.5),
      high = filter("highpass", 80),
      sideTrim = gain(),
      sideOutR = gain(-1),
      midTrim = gain();
    input.connect(split);
    split.connect(midL, 0);
    split.connect(midR, 1);
    link(midL, mid);
    link(midR, mid);
    split.connect(sideL, 0);
    split.connect(sideR, 1);
    link(sideL, side);
    link(sideR, side);
    link(side, high, sideTrim);
    link(mid, midTrim);
    midTrim.connect(merge, 0, 0);
    midTrim.connect(merge, 0, 1);
    sideTrim.connect(merge, 0, 0);
    link(sideTrim, sideOutR);
    sideOutR.connect(merge, 0, 1);
    link(merge, output);
    update = (v) => {
      set(high.frequency, hz(logarithmic(v[1], 20, 500)));
      set(midTrim.gain, db(linear(v[2], -12, 12)));
      set(sideTrim.gain, clamp(v[0]) * 2 * db(linear(v[3], -12, 12)));
    };
  } else if (type === "reverb") {
    const predelay = delay(0),
      convolver = keep(context.createConvolver()),
      tone = filter("lowpass", 10000),
      trim = gain();
    convolver.normalize = false;
    link(input, predelay, convolver, tone, trim, output);
    let lastImpulse = "";
    update = (v) => {
      const duration = Math.round(linear(v[0], 0.15, 5) * 20) / 20,
        decay = Math.round(linear(v[1], 1.2, 7) * 20) / 20,
        key = `${duration}:${decay}`;
      if (key !== lastImpulse) {
        const size = Math.max(1, Math.floor(context.sampleRate * duration));
        const ir = context.createBuffer(2, size, context.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = ir.getChannelData(channel);
          let random = channel === 0 ? 113 : 967;
          for (let i = 0; i < size; i++) {
            random = (Math.imul(random, 1664525) + 1013904223) | 0;
            const noise = ((random >>> 0) / 4294967296) * 2 - 1;
            data[i] =
              noise *
              Math.pow(1 - i / size, decay) *
              Math.sqrt(30 / context.sampleRate);
          }
        }
        convolver.buffer = ir;
        lastImpulse = key;
      }
      set(predelay.delayTime, linear(v[3], 0, 150) / 1000);
      set(tone.frequency, hz(logarithmic(v[2], 300, 18000)));
      set(trim.gain, db(linear(v[4], -18, 6)));
    };
  } else if (type === "tape") {
    const shape = keep(context.createWaveShaper()),
      wow = oscillator(0.35),
      flutter = oscillator(5.8),
      wowDepth = gain(0.0003),
      flutterDepth = gain(0.00003),
      transport = delay(0.008),
      tone = filter("lowpass", 11000),
      trim = gain(),
      noiseGain = gain(0);
    shape.oversample = "2x";
    link(input, shape, transport, tone, trim, output);
    wow.connect(wowDepth);
    wowDepth.connect(transport.delayTime);
    flutter.connect(flutterDepth);
    flutterDepth.connect(transport.delayTime);
    const noiseBuffer = context.createBuffer(
        1,
        Math.max(1, context.sampleRate * 2),
        context.sampleRate,
      ),
      noiseData = noiseBuffer.getChannelData(0);
    let seed = 11341;
    for (let i = 0; i < noiseData.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      noiseData[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    const noise = keep(context.createBufferSource());
    noise.buffer = noiseBuffer;
    noise.loop = true;
    buffers.push(noise);
    link(noise, noiseGain, tone);
    noise.start();
    let lastDrive = -1;
    update = (v) => {
      if (v[0] !== lastDrive) {
        const curve = new Float32Array(4096),
          drive = db(linear(v[0], 0, 18));
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] = Math.tanh(x * drive);
        }
        shape.curve = curve;
        lastDrive = v[0];
      }
      set(wowDepth.gain, clamp(v[1]) * 0.0025);
      set(flutterDepth.gain, clamp(v[2]) * 0.00025);
      set(noiseGain.gain, db(linear(v[3], -90, -40)));
      set(tone.frequency, hz(logarithmic(v[4], 1000, 20000)));
      set(trim.gain, db(linear(v[5], -12, 6)));
    };
  } else input.connect(output);
  return {
    input,
    output,
    update,
    dispose() {
      for (const node of [...oscillators, ...buffers])
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      for (const node of nodes)
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
    },
  };
}

class Insert {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private processor: Processor | null = null;
  private type: EffectType = "off";
  private signature = "";
  constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.wet.gain.value = 0;
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
  }
  set(slot: EffectSlot) {
    const type = slot && Object.hasOwn(effectDefinitions, slot.type) ? slot.type : "off";
    const values = valuesFor(type, slot?.parameters ?? []);
    const mix = clamp(slot?.mix ?? 1);
    const bypass = slot?.bypass ?? false;
    const signature = JSON.stringify([type, values, mix, bypass]);
    if (signature === this.signature) return;
    if (type !== this.type) {
      this.input.disconnect();
      this.input.connect(this.dry);
      this.processor?.dispose();
      this.processor =
        type === "off" ? null : makeProcessor(this.context, type);
      if (this.processor) {
        this.input.connect(this.processor.input);
        this.processor.output.connect(this.wet);
      }
      this.type = type;
    }
    this.processor?.update(values);
    const wet = type === "off" || bypass ? 0 : mix;
    setParam(this.context, this.wet.gain, wet);
    setParam(this.context, this.dry.gain, 1 - wet);
    this.signature = signature;
  }
  dispose() {
    this.processor?.dispose();
    this.input.disconnect();
    this.output.disconnect();
    this.dry.disconnect();
    this.wet.disconnect();
  }
}
/** Four stable insert sockets. Changing a fader never reconstructs this graph. */
export class EffectRack {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly inserts: Insert[];
  constructor(context: BaseAudioContext) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.inserts = Array.from({ length: 4 }, () => new Insert(context));
    let previous: AudioNode = this.input;
    for (const slot of this.inserts) {
      previous.connect(slot.input);
      previous = slot.output;
    }
    previous.connect(this.output);
  }
  setSlots(slots: EffectSlot[]) {
    for (let i = 0; i < 4; i++)
      this.inserts[i].set(
        slots[i] ?? { type: "off", parameters: [], mix: 1, bypass: false },
      );
  }
  dispose() {
    for (const slot of this.inserts) slot.dispose();
    this.input.disconnect();
    this.output.disconnect();
  }
}

export interface EffectPreset {
  name: string;
  category: "Sound Design" | "Mixing" | "Mastering";
  slots: EffectSlot[];
}
const slot = (
  type: EffectType,
  mix = 1,
  overrides: Partial<Record<number, number>> = {},
): EffectSlot => {
  const parameters = [...effectDefinitions[type].defaults];
  for (const [i, v] of Object.entries(overrides))
    if (typeof v === "number") parameters[Number(i)] = v;
  return { type, parameters, mix, bypass: false };
};
const preset = (
  name: string,
  category: EffectPreset["category"],
  slots: EffectSlot[],
): EffectPreset => ({
  name,
  category,
  slots: [
    ...slots,
    ...Array.from({ length: 4 - slots.length }, () => slot("off")),
  ],
});
export const effectPresets: EffectPreset[] = [
  preset("Dusty cassette", "Sound Design", [
    slot("tape", 1, { 0: 0.5, 1: 0.35, 2: 0.2, 3: 0.25, 4: 0.6 }),
    slot("bitcrush", 0.16, { 0: 0.55, 1: 0.6 }),
    slot("eq", 1, { 2: 0.42 }),
  ]),
  preset("Crushed circuit", "Sound Design", [
    slot("bitcrush", 0.8, { 0: 0.22, 1: 0.5, 2: 0.35 }),
    slot("filter", 1, { 0: 0.36, 1: 0.25 }),
    slot("delay", 0.2, { 0: 0.25, 1: 0.3 }),
  ]),
  preset("Wide memory", "Sound Design", [
    slot("chorus", 0.65, { 0: 0.2, 1: 0.65 }),
    slot("width", 1, { 0: 0.72 }),
    slot("reverb", 0.2, { 0: 0.4 }),
  ]),
  preset("Dub echoes", "Sound Design", [
    slot("filter", 1, { 0: 0.4 }),
    slot("delay", 0.45, { 0: 0.56, 1: 0.67, 2: 0.5 }),
    slot("tape", 0.6, { 0: 0.35 }),
  ]),
  preset("Broken radio", "Sound Design", [
    slot("eq", 1, { 0: 0.16, 1: 0.68, 2: 0.22, 3: 0.5 }),
    slot("saturation", 0.65, { 0: 0.55, 1: 0.5 }),
    slot("bitcrush", 0.3, { 0: 0.45, 1: 0.45 }),
  ]),
  preset("Dream room", "Sound Design", [
    slot("chorus", 0.4, { 0: 0.15, 1: 0.55 }),
    slot("reverb", 0.6, { 0: 0.75, 1: 0.3, 3: 0.25 }),
    slot("width", 1, { 0: 0.7 }),
  ]),
  preset("Slow phase", "Sound Design", [
    slot("phaser", 0.75, { 0: 0.12, 1: 0.72, 2: 0.35, 3: 0.45 }),
    slot("delay", 0.18, { 0: 0.5, 1: 0.35 }),
  ]),
  preset("Jet ribbon", "Sound Design", [
    slot("flanger", 0.7, { 0: 0.3, 1: 0.8, 3: 0.68 }),
    slot("saturation", 0.2, { 0: 0.3 }),
    slot("reverb", 0.15),
  ]),
  preset("Chopped tremolo", "Sound Design", [
    slot("tremolo", 1, { 0: 0.75, 1: 0.95, 2: 0.65 }),
    slot("filter", 1, { 0: 0.4 }),
    slot("delay", 0.2, { 0: 0.2, 1: 0.4 }),
  ]),
  preset("Vinyl haze", "Sound Design", [
    slot("tape", 0.9, { 0: 0.25, 1: 0.45, 2: 0.3, 3: 0.5, 4: 0.55 }),
    slot("eq", 1, { 0: 0.58, 2: 0.35 }),
    slot("reverb", 0.12, { 0: 0.2 }),
  ]),
  preset("Metal chamber", "Sound Design", [
    slot("flanger", 0.5, { 0: 0.2, 1: 0.3, 2: 0.3, 3: 0.7 }),
    slot("reverb", 0.45, { 0: 0.4, 1: 0.25, 2: 0.8 }),
    slot("width", 1, { 0: 0.8 }),
  ]),
  preset("Submerged", "Sound Design", [
    slot("filter", 1, { 0: 0.24, 1: 0.32 }),
    slot("chorus", 0.4, { 0: 0.12, 1: 0.65 }),
    slot("delay", 0.3, { 0: 0.6, 1: 0.6, 2: 0.32 }),
    slot("reverb", 0.3, { 0: 0.7, 2: 0.4 }),
  ]),
  preset("Drum punch", "Mixing", [
    slot("transient", 1, { 0: 0.7, 1: 0.55, 3: 0.55, 4: 0.58 }),
    slot("compressor", 1, { 0: 0.67, 1: 0.2, 2: 0.55, 3: 0.4, 5: 0.6 }),
    slot("eq", 1, { 0: 0.58, 2: 0.55 }),
  ]),
  preset("Bass focus", "Mixing", [
    slot("eq", 1, { 0: 0.6, 1: 0.45, 2: 0.35, 3: 0.4 }),
    slot("compressor", 1, { 0: 0.65, 1: 0.2, 2: 0.45, 3: 0.5, 5: 0.58 }),
    slot("width", 1, { 0: 0.1, 1: 0.55 }),
  ]),
  preset("Vocal clarity", "Mixing", [
    slot("eq", 1, { 0: 0.35, 1: 0.57, 2: 0.6, 3: 0.62 }),
    slot("compressor", 1, { 0: 0.65, 1: 0.16, 2: 0.4, 3: 0.4, 5: 0.58 }),
    slot("reverb", 0.12, { 0: 0.22, 3: 0.18 }),
  ]),
  preset("Warm keys", "Mixing", [
    slot("tape", 0.5, { 0: 0.22, 4: 0.78 }),
    slot("chorus", 0.2, { 0: 0.22, 1: 0.3 }),
    slot("reverb", 0.18, { 0: 0.35 }),
  ]),
  preset("Parallel drums", "Mixing", [
    slot("compressor", 0.55, { 0: 0.4, 1: 0.7, 2: 0.3, 3: 0.35, 5: 0.72 }),
    slot("saturation", 0.2, { 0: 0.3 }),
    slot("eq", 1, { 0: 0.55, 2: 0.57 }),
  ]),
  preset("Room glue", "Mixing", [
    slot("compressor", 1, { 0: 0.72, 1: 0.08, 2: 0.55, 3: 0.6, 5: 0.53 }),
    slot("reverb", 0.13, { 0: 0.18, 1: 0.65 }),
  ]),
  preset("Stereo lift", "Mixing", [
    slot("eq", 1, { 2: 0.55 }),
    slot("width", 1, { 0: 0.65, 1: 0.55 }),
    slot("chorus", 0.12, { 0: 0.15, 1: 0.3 }),
  ]),
  preset("Dry control", "Mixing", [
    slot("filter", 1, { 0: 0.54 }),
    slot("compressor", 1, { 0: 0.7, 1: 0.15, 2: 0.45, 3: 0.45, 5: 0.55 }),
    slot("eq", 1, { 0: 0.48, 1: 0.52 }),
  ]),
  preset("Transparent master", "Mastering", [
    slot("eq", 1, { 0: 0.52, 2: 0.53 }),
    slot("compressor", 1, { 0: 0.8, 1: 0.06, 2: 0.6, 3: 0.6, 5: 0.51 }),
    slot("limiter", 1, { 0: 0.94, 1: 0.45, 2: 0.9 }),
  ]),
  preset("Warm master", "Mastering", [
    slot("tape", 0.3, { 0: 0.18, 1: 0.05, 2: 0.02, 3: 0, 4: 0.85 }),
    slot("compressor", 1, { 0: 0.8, 1: 0.08, 2: 0.6, 3: 0.6, 5: 0.52 }),
    slot("limiter", 1, { 0: 0.93, 2: 0.85 }),
  ]),
  preset("Punch master", "Mastering", [
    slot("transient", 0.35, { 0: 0.7, 1: 0.52, 4: 0.53 }),
    slot("compressor", 1, { 0: 0.75, 1: 0.1, 2: 0.65, 3: 0.45, 5: 0.55 }),
    slot("limiter", 1, { 0: 0.9, 1: 0.35, 2: 0.9 }),
  ]),
  preset("Air master", "Mastering", [
    slot("eq", 1, { 0: 0.5, 1: 0.49, 2: 0.56 }),
    slot("width", 1, { 0: 0.57, 1: 0.65 }),
    slot("limiter", 1, { 0: 0.95, 1: 0.55, 2: 0.9 }),
  ]),
  preset("Mono-safe master", "Mastering", [
    slot("width", 1, { 0: 0.5, 1: 0.7 }),
    slot("eq", 1, { 0: 0.51, 2: 0.52 }),
    slot("compressor", 1, { 0: 0.82, 1: 0.06, 2: 0.6, 3: 0.5, 5: 0.51 }),
    slot("limiter", 1, { 0: 0.95, 2: 0.9 }),
  ]),
  preset("Soft landing", "Mastering", [
    slot("saturation", 0.15, { 0: 0.12, 1: 0.9, 3: 0.75 }),
    slot("compressor", 1, { 0: 0.82, 1: 0.07, 2: 0.7, 3: 0.65, 5: 0.51 }),
    slot("limiter", 1, { 0: 0.95, 1: 0.6, 2: 0.8 }),
  ]),
];
