import { describe, it, expect } from "vitest";
import { estimateKey, encodeWav, decodeAiffPCM } from "./pcm";
const chord = (midi: number[]) => {
  const rate = 22050,
    pcm = new Float32Array(rate * 3);
  for (let i = 0; i < pcm.length; i++)
    pcm[i] = midi.reduce(
      (s, n) =>
        s +
        0.15 * Math.sin((2 * Math.PI * 440 * 2 ** ((n - 69) / 12) * i) / rate),
      0,
    );
  return pcm;
};
describe("PCM analysis and files", () => {
  it("estimates tonal major and minor material from actual PCM", () => {
    expect(estimateKey(chord([60, 64, 67, 72]), 22050)).toBe("C major");
    expect(estimateKey(chord([57, 60, 64, 69]), 22050)).toBe("A minor");
  });
  it("does not assign a musical key to silence or broad noise", () => {
    expect(estimateKey(new Float32Array(22050), 22050)).toBe("Unknown");
    let seed = 127;
    const noise = Float32Array.from({ length: 22050 * 4 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0xffffffff - 0.5;
    });
    expect(estimateKey(noise, 22050)).toBe("Unknown");
  });
  it("writes interleaved 24-bit stereo RIFF with bounded samples", async () => {
    const blob = encodeWav(
      [new Float32Array([-2, 0, 1]), new Float32Array([0.5, -0.5, 0])],
      44100,
    );
    const bytes = await blob.arrayBuffer(),
      view = new DataView(bytes);
    expect(blob.type).toBe("audio/wav");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint32(40, true)).toBe(18);
    expect([view.getUint8(44), view.getUint8(45), view.getUint8(46)]).toEqual([
      0, 0, 128,
    ]);
  });
  it("rejects truncated or non-AIFF PCM before reading sample payload", () => {
    expect(() => decodeAiffPCM(new ArrayBuffer(8))).toThrow("Not an AIFF");
  });
});
