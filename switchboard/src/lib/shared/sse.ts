import type { StreamEvent } from "./types";

/** Encode one event as a Server-Sent Events frame. */
export function encodeEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser. Feed it raw text chunks; it returns every complete
 * event and keeps partial frames buffered until the rest arrives.
 */
export class SSEParser {
  private buffer = "";

  push(chunk: string): StreamEvent[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events: StreamEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as StreamEvent);
      } catch {
        // Ignore malformed frames rather than killing the stream.
      }
    }
    return events;
  }
}

/** Read an SSE response body and yield parsed events. */
export async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) yield ev;
    }
    for (const ev of parser.push(decoder.decode() + "\n\n")) yield ev;
  } finally {
    reader.releaseLock();
  }
}
