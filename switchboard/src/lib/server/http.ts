import "server-only";
import { encodeEvent } from "@/lib/shared/sse";
import type { StreamEvent } from "@/lib/shared/types";
import { getConfig } from "./config";
import { jsonError, toAppError } from "./errors";
import { clientKey, RateLimiter } from "./rate-limit";

let limiter: { n: number; rl: RateLimiter } | null = null;

/** Returns a 429 response when the caller is over the per-minute budget, else null. */
export function checkRateLimit(req: Request): Response | null {
  const n = getConfig().rateLimitPerMinute;
  if (!limiter || limiter.n !== n) limiter = { n, rl: RateLimiter.perMinute(n) };
  const wait = limiter.rl.take(clientKey(req));
  if (!wait) return null;
  return jsonError({ code: "rate_limited", message: `Too many requests to this server. Try again in ${wait}s.`, status: 429, retryAfterSeconds: wait });
}

export async function readJson<T>(req: Request, maxBytes = 60 * 1024 * 1024): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw Object.assign(new Error("Request body too large."), { status: 413 });
  try {
    return (await req.json()) as T;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

/**
 * Build a Server-Sent Events response. `run` receives an `emit` function and an
 * abort signal that fires when the client disconnects. Unhandled errors are
 * converted into a final `error` event rather than a broken stream.
 */
export function sseResponse(req: Request, run: (emit: (ev: StreamEvent) => void, signal: AbortSignal) => Promise<void>): Response {
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let open = true;
      const emit = (ev: StreamEvent) => {
        if (!open) return;
        try {
          ctrl.enqueue(encoder.encode(encodeEvent(ev)));
        } catch {
          open = false;
        }
      };
      // Keep proxies from closing idle connections during long tool runs.
      const heartbeat = setInterval(() => {
        if (open) {
          try {
            ctrl.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            open = false;
          }
        }
      }, 15_000);
      try {
        await run(emit, controller.signal);
      } catch (e) {
        const err = toAppError(e);
        if (err.code !== "aborted") console.error("[stream]", err.code, err.message);
        emit({ type: "error", error: err });
      } finally {
        clearInterval(heartbeat);
        open = false;
        try {
          ctrl.close();
        } catch {
          /* client already gone */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export function handleRouteError(e: unknown): Response {
  const err = toAppError(e);
  if (err.status >= 500) console.error("[api]", err.message);
  return jsonError(err);
}
