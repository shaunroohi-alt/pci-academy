import { describe, expect, it } from "vitest";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";

describe("RateLimiter", () => {
  it("allows a burst up to capacity then asks the caller to wait", () => {
    let now = 0;
    const rl = RateLimiter.perMinute(3, () => now);
    expect([rl.take("a"), rl.take("a"), rl.take("a")]).toEqual([0, 0, 0]);
    const wait = rl.take("a");
    expect(wait).toBeGreaterThan(0);
    expect(rl.take("b")).toBe(0); // keys are independent
    now += 20_000; // one token refills every 20s at 3/min
    expect(rl.take("a")).toBe(0);
  });

  it("is disabled at 0", () => {
    const rl = RateLimiter.perMinute(0);
    for (let i = 0; i < 100; i++) expect(rl.take("x")).toBe(0);
  });

  it("derives the client key from forwarding headers", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }))).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x"))).toBe("local");
  });
});
