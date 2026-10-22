/** PCM containers are kept in the browser; no source audio is uploaded. */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number,
): Blob {
  if (
    channels.length < 1 ||
    channels.length > 2 ||
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 384000
  )
    throw new Error("WAV export requires mono/stereo PCM at 8–384 kHz.");
  const frames = channels[0].length;
  if (!frames || channels.some((c) => c.length !== frames))
    throw new Error("WAV channels must have the same nonzero length.");
  const bytes = frames * channels.length * 3;
  if (bytes > 0xffffffff - 36)
    throw new Error("This WAV is too large for the RIFF file format.");
  const buffer = new ArrayBuffer(44 + bytes),
    view = new DataView(buffer);
  const word = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, bytes + 36, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 3, true);
  view.setUint16(32, channels.length * 3, true);
  view.setUint16(34, 24, true);
  word(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++)
    for (const channel of channels) {
      const sample = Number.isFinite(channel[i])
        ? Math.max(-1, Math.min(1, channel[i]))
        : 0;
      const value = Math.round(
        sample < 0 ? sample * 8388608 : sample * 8388607,
      );
      view.setUint8(offset++, value & 255);
      view.setUint8(offset++, (value >> 8) & 255);
      view.setUint8(offset++, (value >> 16) & 255);
    }
  return new Blob([buffer], { type: "audio/wav" });
}
export interface DecodedPCM {
  channels: Float32Array[];
  sampleRate: number;
}
export function decodeAiffPCM(data: ArrayBuffer): DecodedPCM {
  const v = new DataView(data),
    text = (at: number, n: number) =>
      String.fromCharCode(...new Uint8Array(data, at, n));
  if (
    v.byteLength < 12 ||
    text(0, 4) !== "FORM" ||
    !["AIFF", "AIFC"].includes(text(8, 4))
  )
    throw new Error("Not an AIFF file.");
  let channels = 0,
    frames = 0,
    bits = 0,
    rate = 0,
    kind = "NONE",
    audioOffset = 0,
    audioSize = 0;
  for (let cursor = 12; cursor + 8 <= v.byteLength; ) {
    const name = text(cursor, 4),
      size = v.getUint32(cursor + 4),
      start = cursor + 8;
    if (size > v.byteLength - start) throw new Error("Truncated AIFF chunk.");
    if (name === "COMM") {
      if (size < 18) throw new Error("AIFF sample information is incomplete.");
      channels = v.getUint16(start);
      frames = v.getUint32(start + 2);
      bits = v.getUint16(start + 6);
      const exponent = v.getUint16(start + 8),
        hi = v.getUint32(start + 10),
        lo = v.getUint32(start + 14);
      rate =
        (hi * 4294967296 + lo) *
        2 ** ((exponent & 32767) - 16383 - 63) *
        (exponent & 32768 ? -1 : 1);
      if (text(8, 4) === "AIFC") {
        if (size < 22) throw new Error("AIFC compression header is missing.");
        kind = text(start + 18, 4);
      }
    }
    if (name === "SSND") {
      if (size < 8) throw new Error("AIFF sound chunk is incomplete.");
      const skip = v.getUint32(start);
      if (skip > size - 8) throw new Error("AIFF sound offset is invalid.");
      audioOffset = start + 8 + skip;
      audioSize = size - 8 - skip;
    }
    cursor = start + size + (size & 1);
  }
  if (
    channels < 1 ||
    channels > 2 ||
    frames < 1 ||
    frames > 32000000 ||
    rate < 8000 ||
    rate > 384000 ||
    !Number.isFinite(rate)
  )
    throw new Error(
      "Import mono or stereo AIFF, 8–384 kHz, up to 32 million frames.",
    );
  if (!["NONE", "twos", "sowt", "fl32", "FL32", "fl64", "FL64"].includes(kind))
    throw new Error(
      `AIFF compression ${kind} is not supported; export PCM AIFF or WAV.`,
    );
  const floating = /fl32|FL32|fl64|FL64/.test(kind),
    little = kind === "sowt",
    bytes = bits / 8;
  if (
    ![1, 2, 3, 4, 8].includes(bytes) ||
    (floating && ![4, 8].includes(bytes)) ||
    (!floating && bytes === 8) ||
    audioSize < frames * channels * bytes
  )
    throw new Error("AIFF sample format or sound size is invalid.");
  const output = Array.from(
    { length: channels },
    () => new Float32Array(frames),
  );
  let offset = audioOffset;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      let x = 0;
      if (floating)
        x =
          bytes === 4
            ? v.getFloat32(offset, little)
            : v.getFloat64(offset, little);
      else if (bytes === 1) x = v.getInt8(offset) / 128;
      else if (bytes === 2) x = v.getInt16(offset, little) / 32768;
      else if (bytes === 3) {
        let n = little
          ? v.getUint8(offset) |
            (v.getUint8(offset + 1) << 8) |
            (v.getUint8(offset + 2) << 16)
          : (v.getUint8(offset) << 16) |
            (v.getUint8(offset + 1) << 8) |
            v.getUint8(offset + 2);
        if (n & 0x800000) n -= 0x1000000;
        x = n / 8388608;
      } else x = v.getInt32(offset, little) / 2147483648;
      output[c][i] = Number.isFinite(x) ? x : 0;
      offset += bytes;
    }
  return { channels: output, sampleRate: Math.round(rate) };
}
/** Conservative onset-correlation estimate; users retain editable source BPM. */
export function estimateBpm(samples: Float32Array, sampleRate: number): number {
  const hop = Math.max(1, Math.round(sampleRate / 200)),
    count = Math.min(Math.floor(samples.length / hop), 24000);
  if (count < 400) return 120;
  const onset = new Float32Array(count);
  let previous = 0,
    energy = 0;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < hop; j += 4) {
      const x = samples[i * hop + j] ?? 0;
      sum += x * x;
    }
    const level = Math.sqrt(sum / Math.ceil(hop / 4));
    onset[i] = Math.max(0, level - previous);
    previous = level;
    energy += onset[i];
  }
  if (energy < 0.001) return 120;
  const fps = sampleRate / hop;
  let best = 120,
    bestScore = 0;
  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = Math.round((fps * 60) / bpm);
    let score = 0;
    for (let i = lag; i < count; i++) score += onset[i] * onset[i - lag];
    // A quarter-note candidate also gets support at its two-beat interval.
    for (let i = lag * 2; i < count; i++)
      score += 0.35 * onset[i] * onset[i - lag * 2];
    score *= 1 - (0.08 * Math.abs(bpm - 115)) / 65;
    if (score > bestScore) {
      bestScore = score;
      best = bpm;
    }
  }
  return best;
}

/** Bounded chroma/profile analysis, matching the native Krumhansl key model. */
export function estimateKey(samples: Float32Array, sampleRate: number): string {
  const size = 4096,
    analysisRate = Math.min(11025, sampleRate),
    frames = Math.min(samples.length, Math.floor(sampleRate * 120));
  if (frames < 512) return "Unknown";
  const span = (size * sampleRate) / analysisRate,
    windows = Math.min(48, Math.max(1, Math.floor(frames / (span / 2))));
  const re = new Float64Array(size),
    im = new Float64Array(size),
    chroma = new Float64Array(12),
    hann = Float64Array.from(
      { length: size },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
    );
  let energy = 0;
  for (let w = 0; w < windows; w++) {
    const start =
      windows === 1
        ? 0
        : Math.floor((w * Math.max(0, frames - span)) / (windows - 1));
    im.fill(0);
    for (let i = 0; i < size; i++) {
      const position = start + (i * sampleRate) / analysisRate,
        index = Math.floor(position),
        mix = position - index;
      re[i] =
        ((samples[index] ?? 0) * (1 - mix) + (samples[index + 1] ?? 0) * mix) *
        hann[i];
    }
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const a = re[i];
        re[i] = re[j];
        re[j] = a;
      }
    }
    for (let width = 2; width <= size; width <<= 1) {
      const angle = (-2 * Math.PI) / width,
        stepR = Math.cos(angle),
        stepI = Math.sin(angle);
      for (let base = 0; base < size; base += width) {
        let rotationR = 1,
          rotationI = 0;
        for (let k = 0; k < width / 2; k++) {
          const a = base + k,
            b = a + width / 2,
            br = re[b] * rotationR - im[b] * rotationI,
            bi = re[b] * rotationI + im[b] * rotationR;
          re[b] = re[a] - br;
          im[b] = im[a] - bi;
          re[a] += br;
          im[a] += bi;
          const nextR = rotationR * stepR - rotationI * stepI;
          rotationI = rotationR * stepI + rotationI * stepR;
          rotationR = nextR;
        }
      }
    }
    for (let bin = 1; bin < size / 2; bin++) {
      const frequency = (bin * analysisRate) / size;
      if (frequency < 65 || frequency > Math.min(4000, analysisRate * 0.45))
        continue;
      const midi = 69 + 12 * Math.log2(frequency / 440),
        note = Math.round(midi),
        tuning = Math.max(0, 1 - 2 * Math.abs(midi - note));
      const magnitude = Math.hypot(re[bin], im[bin]) * tuning;
      chroma[((note % 12) + 12) % 12] += magnitude;
      energy += magnitude;
    }
  }
  if (energy < 1e-5) return "Unknown";
  const mean = energy / 12,
    variance = chroma.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 12;
  if (
    Math.sqrt(variance) / mean < 0.12 ||
    chroma.filter((v) => v > energy * 0.04).length < 3
  )
    return "Unknown";
  const profiles = [
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  ];
  let best = -2,
    tonic = 0,
    mode = 0;
  profiles.forEach((profile, m) => {
    const pMean = profile.reduce((s, v) => s + v, 0) / 12;
    for (let root = 0; root < 12; root++) {
      let dot = 0,
        xNorm = 0,
        yNorm = 0;
      for (let note = 0; note < 12; note++) {
        const x = chroma[note] - mean,
          y = profile[(note - root + 12) % 12] - pMean;
        dot += x * y;
        xNorm += x * x;
        yNorm += y * y;
      }
      const score = dot / Math.sqrt(Math.max(1e-30, xNorm * yNorm));
      if (score > best) {
        best = score;
        tonic = root;
        mode = m;
      }
    }
  });
  return best < 0.45
    ? "Unknown"
    : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][tonic] +
        (mode ? " minor" : " major");
}
