/**
 * Fixed-window-ish token bucket keyed by client. Protects provider quotas and
 * wallets from a runaway tab or an exposed deployment. In-memory: fine for a
 * single local/containerised instance.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private capacity: number,
    private refillPerMs: number,
    private now: () => number = Date.now,
  ) {}

  static perMinute(n: number, now?: () => number): RateLimiter {
    return new RateLimiter(n, n / 60_000, now);
  }

  /** Returns 0 if allowed, otherwise seconds until a token is available. */
  take(key: string): number {
    if (this.capacity <= 0) return 0; // disabled
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.updated) * this.refillPerMs);
    b.updated = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.buckets.set(key, b);
      this.gc(t);
      return 0;
    }
    this.buckets.set(key, b);
    return Math.max(1, Math.ceil((1 - b.tokens) / this.refillPerMs / 1000));
  }

  private gc(t: number) {
    if (this.buckets.size < 1000) return;
    for (const [k, b] of this.buckets) if (t - b.updated > 10 * 60_000) this.buckets.delete(k);
  }
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}
