import type { Message, StreamEvent } from "@/lib/shared/types";
import type { ChatProvider } from "@/lib/server/providers/types";
import { executeTool, toolSpecs, type ToolContext } from "./tools";

export function agentSystemPrompt(shellEnabled: boolean, extra?: string): string {
  return [
    "You are a coding agent working inside a local project workspace, similar to Claude Code.",
    "Use the provided tools to inspect and change files. All paths are relative to the workspace root; you cannot access anything outside it.",
    "Read files before editing them. Prefer edit_file for targeted changes and write_file for new files.",
    shellEnabled
      ? "You can run shell commands with run_command (builds, tests, git). Verify your changes by running the relevant checks when practical."
      : "Shell access is disabled, so you cannot run commands; say so if verification would need one.",
    "When you are done, reply with a short summary of what you changed and anything the user must do next.",
    extra?.trim() ? `\nAdditional instructions from the user:\n${extra.trim()}` : "",
  ].join("\n");
}

export interface AgentRunOptions {
  provider: ChatProvider;
  model: string;
  messages: Message[];
  systemPrompt?: string;
  maxSteps: number;
  maxTokens?: number;
  ctx: ToolContext;
  signal: AbortSignal;
  emit: (ev: StreamEvent) => void;
}

/** Drive the tool-use loop until the model stops calling tools or the step budget runs out. */
export async function runAgent(o: AgentRunOptions): Promise<string> {
  if (!o.provider.startAgent) throw new Error(`${o.provider.label} does not support agent mode.`);
  const session = o.provider.startAgent({
    model: o.model,
    system: agentSystemPrompt(o.ctx.shellEnabled, o.systemPrompt),
    tools: toolSpecs(o.ctx.shellEnabled),
    messages: o.messages,
    maxTokens: o.maxTokens,
  });
  let transcript = "";
  for (let step = 0; step < o.maxSteps; step++) {
    const result = await session.step(o.signal, (delta) => {
      transcript += delta;
      o.emit({ type: "text", delta });
    });
    if (result.usage) o.emit({ type: "usage", usage: result.usage });
    if (!result.toolCalls.length) {
      if (result.stopReason === "refusal") o.emit({ type: "text", delta: "\n\n_The model declined to continue._" });
      if (result.stopReason === "max_tokens" || result.stopReason === "length") {
        o.emit({ type: "text", delta: "\n\n_[Stopped: max tokens reached.]_" });
      }
      o.emit({ type: "done", stopReason: result.stopReason });
      return transcript;
    }
    if (transcript && !transcript.endsWith("\n")) {
      transcript += "\n";
      o.emit({ type: "text", delta: "\n" });
    }
    const results = [];
    for (const call of result.toolCalls) {
      o.emit({ type: "tool_call", id: call.id, name: call.name, input: call.input });
      const r = call.parseError
        ? { output: call.parseError, isError: true }
        : await executeTool(call.name, call.input, { ...o.ctx, signal: o.signal });
      o.emit({ type: "tool_result", id: call.id, name: call.name, output: r.output.slice(0, 20_000), isError: r.isError });
      results.push({ id: call.id, name: call.name, output: r.output, isError: r.isError });
    }
    session.addToolResults(results);
  }
  o.emit({ type: "text", delta: `\n\n_[Stopped after ${o.maxSteps} steps — raise MAX_AGENT_STEPS to allow longer runs.]_` });
  o.emit({ type: "done", stopReason: "max_steps" });
  return transcript;
}
