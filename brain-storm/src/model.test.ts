import { describe, it, expect } from "vitest";
import { createSession, validateSession } from "./model";
describe("session validation at the import boundary", () => {
  it("accepts a new complete studio without audio", () =>
    expect(validateSession(createSession()).patterns).toHaveLength(16));
  it("rejects nonfinite DSP parameters before audio graphs see them", () => {
    const s = createSession();
    s.tracks[7].effects[3] = {
      type: "delay",
      parameters: [NaN],
      mix: 1,
      bypass: false,
    };
    expect(() => validateSession(s)).toThrow();
  });
  it("rejects missing pattern and audio content references", () => {
    const s = createSession();
    s.launchSlots[7][3] = { kind: "audio", contentId: "missing" };
    expect(() => validateSession(s)).toThrow();
  });
  it("rejects malformed note ownership and out-of-range positions", () => {
    const s = createSession();
    s.patterns[15].notes = [
      { id: "bad", pad: 32, beat: 0, duration: 1, velocity: 1, pitch: 0 },
    ];
    expect(() => validateSession(s)).toThrow();
  });
  it("rejects duplicate clip identities", () => {
    const s = createSession();
    const c = {
      id: "same",
      track: 0,
      kind: "pattern" as const,
      contentId: "p0",
      beat: 0,
      length: 4,
      offset: 0,
      loop: false,
      gain: 1,
    };
    s.clips = [c, { ...c, track: 7 }];
    expect(() => validateSession(s)).toThrow();
  });
});
