import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { createSession } from "./model";
import { saveSession, openSession, validateArchiveSize } from "./session";
import type { AudioEngine } from "./contracts";
class TestBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  private channels: Float32Array[];
  constructor(o: {
    length: number;
    numberOfChannels: number;
    sampleRate: number;
  }) {
    Object.assign(this, o);
    this.length = o.length;
    this.numberOfChannels = o.numberOfChannels;
    this.sampleRate = o.sampleRate;
    this.channels = Array.from(
      { length: o.numberOfChannels },
      () => new Float32Array(o.length),
    );
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number) {
    return this.channels[c];
  }
}
describe("self-contained browser sessions", () => {
  it("restores original PCM, cached stems and Serato markers over another source", async () => {
    vi.stubGlobal("AudioBuffer", TestBuffer);
    try {
      const state = createSession(),
        source = new TestBuffer({
          length: 800,
          numberOfChannels: 2,
          sampleRate: 8000,
        });
      source.getChannelData(0)[17] = 0.314159;
      source.getChannelData(1)[42] = -0.25;
      const stem = new TestBuffer({
        length: 800,
        numberOfChannels: 2,
        sampleRate: 8000,
      });
      stem.getChannelData(0)[3] = 0.125;
      state.source = {
        assetId: "new-source",
        name: "Original.wav",
        duration: 0.1,
        sampleRate: 8000,
        channels: 2,
        bpm: 120,
        key: "C",
      };
      state.seratoCues = [
        { index: 2, time: 0.05, name: "Hook", colour: "#cf6148" },
      ];
      const input = {
        getBuffer: () => source,
        getStems: () => [stem, null, null, null],
      } as unknown as AudioEngine;
      const blob = await saveSession(state, input, () => {}),
        installed = new Map(),
        setStems = vi.fn();
      const output = {
        installBuffer: (info: { assetId: string }, buffer: AudioBuffer) =>
          installed.set(info.assetId, buffer),
        setStems,
      } as unknown as AudioEngine;
      const restored = await openSession(
        new File([blob], "test.brainstorm"),
        output,
      );
      expect(restored.seratoCues).toEqual(state.seratoCues);
      expect(installed.get("new-source").getChannelData(0)[17]).toBeCloseTo(
        0.314159,
        6,
      );
      expect(setStems).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(TestBuffer), null, null, null]),
        "new-source",
      );
      expect(setStems.mock.calls[0][0][0].getChannelData(0)[3]).toBe(0.125);
      installed.clear();
      setStems.mockClear();
      await expect(
        openSession(
          new File([blob], "cancelled.brainstorm"),
          output,
          () => false,
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(installed.size).toBe(0);
      expect(setStems).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects oversized declared expansion before allocating archive audio", async () => {
    const archive = new JSZip();
    archive.file("audio/asset-0.wav", "tiny");
    const bytes = await archive.generateAsync({ type: "arraybuffer" }),
      v = new DataView(bytes);
    for (let p = 0; p < bytes.byteLength - 46; p++)
      if (v.getUint32(p, true) === 0x02014b50) {
        v.setUint32(p + 24, 0x7fffffff, true);
        break;
      }
    expect(() => validateArchiveSize(bytes)).toThrow("memory limit");
  });
});
