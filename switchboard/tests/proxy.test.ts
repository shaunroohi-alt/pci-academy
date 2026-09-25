import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const req = (path: string, auth?: string) => new NextRequest(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} });

describe("basic auth proxy", () => {
  afterEach(() => {
    delete process.env.APP_PASSWORD;
  });

  it("is open when APP_PASSWORD is unset", () => {
    expect(proxy(req("/")).status).toBe(200);
  });

  it("requires credentials when APP_PASSWORD is set", () => {
    process.env.APP_PASSWORD = "s3cret:with:colons";
    expect(proxy(req("/")).status).toBe(401);
    expect(proxy(req("/", `Basic ${btoa("admin:wrong")}`)).status).toBe(401);
    expect(proxy(req("/api/chat", `Basic ${btoa("admin:s3cret:with:colons")}`)).status).toBe(200);
    expect(proxy(req("/api/health")).status).toBe(200);
  });
});
