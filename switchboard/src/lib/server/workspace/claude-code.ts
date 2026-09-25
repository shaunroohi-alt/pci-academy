import { spawn } from "node:child_process";
import type { StreamEvent } from "@/lib/shared/types";
import { childEnv } from "./exec";

interface CliBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("");
  return JSON.stringify(content ?? "");
}

/** Translate one line of `claude -p --output-format stream-json` into UI events. */
export function parseClaudeCodeLine(line: string): StreamEvent[] {
  let msg: { type?: string; subtype?: string; message?: { content?: CliBlock[] }; result?: string; is_error?: boolean; usage?: { input_tokens?: number; output_tokens?: number } };
  try {
    msg = JSON.parse(line);
  } catch {
    return line.trim() ? [{ type: "log", stream: "stdout", text: line }] : [];
  }
  const out: StreamEvent[] = [];
  if (msg.type === "assistant") {
    for (const b of msg.message?.content ?? []) {
      if (b.type === "text" && b.text) out.push({ type: "text", delta: b.text + "\n" });
      if (b.type === "tool_use") out.push({ type: "tool_call", id: b.id ?? "", name: b.name ?? "tool", input: b.input });
    }
  } else if (msg.type === "user") {
    for (const b of msg.message?.content ?? []) {
      if (b.type === "tool_result") {
        out.push({ type: "tool_result", id: b.tool_use_id ?? "", name: "", output: blockText(b.content).slice(0, 20_000), isError: Boolean(b.is_error) });
      }
    }
  } else if (msg.type === "result") {
    if (msg.usage) out.push({ type: "usage", usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens } });
    if (msg.is_error) out.push({ type: "error", error: { code: "unknown", message: msg.result || `Claude Code finished with ${msg.subtype}`, status: 500 } });
  } else if (msg.type === "system" && msg.subtype === "init") {
    out.push({ type: "log", stream: "info", text: "Claude Code session started." });
  }
  return out;
}

/**
 * Run the official Claude Code CLI headlessly in the workspace and stream its
 * events. Requires `claude` to be installed and authenticated on this machine.
 */
export function runClaudeCode(opts: {
  bin: string;
  args: string[];
  prompt: string;
  cwd: string;
  signal: AbortSignal;
  emit: (ev: StreamEvent) => void;
}): Promise<number | null> {
  return new Promise((resolve) => {
    const args = ["-p", opts.prompt, "--output-format", "stream-json", "--verbose", ...opts.args];
    // The CLI is Anthropic's own client, so it may use ANTHROPIC_API_KEY if present.
    const extra: Record<string, string> = {};
    if (process.env.ANTHROPIC_API_KEY) extra.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const child = spawn(opts.bin, args, { cwd: opts.cwd, env: childEnv(extra), stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        for (const ev of parseClaudeCodeLine(line)) opts.emit(ev);
      }
    });
    child.stderr.on("data", (d: Buffer) => opts.emit({ type: "log", stream: "stderr", text: d.toString("utf8") }));
    child.on("error", (e) => {
      opts.emit({ type: "error", error: { code: "not_configured", message: `Could not start "${opts.bin}": ${e.message}. Install Claude Code or set CLAUDE_CODE_BIN.`, status: 500 } });
    });
    const onAbort = () => child.kill("SIGTERM");
    opts.signal.addEventListener("abort", onAbort, { once: true });
    child.on("close", (code) => {
      opts.signal.removeEventListener("abort", onAbort);
      for (const ev of parseClaudeCodeLine(buf)) opts.emit(ev);
      resolve(code);
    });
  });
}
