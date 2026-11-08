import type { AppError, ErrorCode } from "@/lib/shared/types";

export class ProviderError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 500,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
  const v = (headers as Record<string, unknown>)[name];
  return typeof v === "string" ? v : undefined;
}

function parseRetryAfter(headers: unknown): number | undefined {
  const raw = headerValue(headers, "retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, Math.ceil(secs));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

const codeByStatus: Record<number, ErrorCode> = {
  400: "bad_request",
  401: "auth",
  403: "auth",
  404: "not_found",
  413: "bad_request",
  422: "bad_request",
  429: "rate_limited",
  503: "overloaded",
  529: "overloaded",
};

/** Strip anything that looks like a credential from a message before it reaches the browser. */
export function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***")
    .replace(/(api[_-]?key["'=:\s]+)[^\s"'&]+/gi, "$1***")
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1***");
}

/**
 * Normalise errors from any provider SDK (Anthropic, OpenAI, Google GenAI) or
 * the network layer into one shape the UI knows how to present.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof ProviderError) {
    return { code: err.code, message: redact(err.message), status: err.status, retryAfterSeconds: err.retryAfterSeconds };
  }
  const e = err as { name?: string; status?: unknown; headers?: unknown; message?: string; code?: unknown; cause?: unknown };
  const message = redact(String(e?.message ?? err ?? "Unknown error")).slice(0, 2000);

  // SDK error classes don't always set `.name`; fall back to the constructor name.
  const kind = `${e?.name ?? ""} ${(err as object)?.constructor?.name ?? ""}`;
  if (/AbortError|APIUserAbortError/.test(kind)) {
    return { code: "aborted", message: "Request was cancelled.", status: 499 };
  }
  const status = typeof e?.status === "number" ? e.status : undefined;
  if (status) {
    const code = codeByStatus[status] ?? (status >= 500 ? "overloaded" : "unknown");
    const friendly: Partial<Record<ErrorCode, string>> = {
      rate_limited: "Rate limit reached for this provider.",
      auth: "The provider rejected the API key (check your .env).",
      overloaded: "The provider is overloaded or unavailable right now.",
      not_found: "Model or endpoint not found.",
    };
    const prefix = friendly[code];
    return {
      code,
      message: prefix ? `${prefix} ${message}` : message,
      status: status >= 400 ? status : 500,
      retryAfterSeconds: parseRetryAfter(e.headers),
    };
  }
  const netCode = typeof e?.code === "string" ? e.code : (e?.cause as { code?: string })?.code;
  if (
    /APIConnection(Timeout)?Error/.test(kind) ||
    (netCode && ["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(netCode)) ||
    /fetch failed|network|connection error|ECONNREFUSED/i.test(message)
  ) {
    return { code: "network", message: `Could not reach the provider: ${message}`, status: 502 };
  }
  return { code: "unknown", message, status: 500 };
}

export function jsonError(error: AppError): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (error.retryAfterSeconds !== undefined) headers["retry-after"] = String(error.retryAfterSeconds);
  return new Response(JSON.stringify({ error }), { status: error.status, headers });
}
