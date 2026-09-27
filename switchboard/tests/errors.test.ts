import { describe, expect, it } from "vitest";
import { ProviderError, redact, toAppError } from "@/lib/server/errors";

describe("toAppError", () => {
  it("maps 429 with retry-after (Headers and plain objects)", () => {
    const e1 = toAppError(Object.assign(new Error("slow down"), { status: 429, headers: new Headers({ "retry-after": "12" }) }));
    expect(e1).toMatchObject({ code: "rate_limited", status: 429, retryAfterSeconds: 12 });
    const e2 = toAppError(Object.assign(new Error("x"), { status: 429, headers: { "retry-after": "3" } }));
    expect(e2.retryAfterSeconds).toBe(3);
  });

  it("maps auth, overload and not found", () => {
    expect(toAppError({ status: 401, message: "bad key" }).code).toBe("auth");
    expect(toAppError({ status: 529, message: "overloaded" }).code).toBe("overloaded");
    expect(toAppError({ status: 503, message: "x" }).code).toBe("overloaded");
    expect(toAppError({ status: 404, message: "no model" }).code).toBe("not_found");
  });

  it("detects aborts and network failures", () => {
    expect(toAppError(Object.assign(new Error("x"), { name: "AbortError" })).code).toBe("aborted");
    expect(toAppError(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })).code).toBe("network");
  });

  it("passes ProviderError through", () => {
    expect(toAppError(new ProviderError("not_configured", "no key", 400))).toEqual({ code: "not_configured", message: "no key", status: 400, retryAfterSeconds: undefined });
  });

  it("redacts secrets from messages", () => {
    const msg = toAppError({ status: 401, message: "Incorrect API key provided: sk-proj-abcdefghijklmnop" }).message;
    expect(msg).not.toContain("abcdefghijklmnop");
    expect(redact("key=AIzaSyA1234567890123456789012345")).not.toContain("SyA1234567890");
    expect(redact("Authorization: Bearer abc.def")).toBe("Authorization: Bearer ***");
  });
});
