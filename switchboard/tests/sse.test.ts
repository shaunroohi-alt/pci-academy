import { describe, expect, it } from "vitest";
import { encodeEvent, readEventStream, SSEParser } from "@/lib/shared/sse";
import type { StreamEvent } from "@/lib/shared/types";

describe("SSE", () => {
  it("round-trips events split across arbitrary chunk boundaries", () => {
    const events: StreamEvent[] = [
      { type: "text", delta: "hello\n\nworld" },
      { type: "usage", usage: { inputTokens: 1, outputTokens: 2 } },
      { type: "done", stopReason: "end_turn" },
    ];
    const wire = events.map(encodeEvent).join("") + ": ping\n\n";
    const parser = new SSEParser();
    const out: StreamEvent[] = [];
    for (let i = 0; i < wire.length; i += 7) out.push(...parser.push(wire.slice(i, i + 7)));
    expect(out).toEqual(events);
  });

  it("ignores malformed frames", () => {
    const parser = new SSEParser();
    expect(parser.push("data: {not json}\n\n" + encodeEvent({ type: "done" }))).toEqual([{ type: "done" }]);
  });

  it("reads a ReadableStream body", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(encodeEvent({ type: "text", delta: "a" }).slice(0, 5)));
        c.enqueue(enc.encode(encodeEvent({ type: "text", delta: "a" }).slice(5)));
        c.enqueue(enc.encode(encodeEvent({ type: "done" })));
        c.close();
      },
    });
    const got = [];
    for await (const ev of readEventStream(body)) got.push(ev);
    expect(got).toEqual([{ type: "text", delta: "a" }, { type: "done" }]);
  });
});
