import "server-only";
import type { StreamEvent } from "@/lib/shared/types";
import { normalizeHistory } from "./history";
import type { AgentSession, ChatInput, ChatProvider } from "./types";

/**
 * Offline echo provider for demos, UI development and tests. Enabled with
 * ENABLE_MOCK_PROVIDER=true. It never calls the network.
 */
export class MockProvider implements ChatProvider {
  id = "mock" as const;
  label = "Mock (offline)";
  capabilities = { images: true, pdf: true, tools: true };

  constructor(private delayMs = 15) {}

  configured() {
    return true;
  }

  fallbackModels() {
    return { models: [{ id: "echo", label: "echo" }, { id: "fail", label: "fail (simulated 429)" }], source: "default" as const };
  }

  defaultModel() {
    return "echo";
  }

  private wait(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      const t = setTimeout(resolve, this.delayMs);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    });
  }

  async *stream(input: ChatInput): AsyncGenerator<StreamEvent> {
    if (input.model === "fail") {
      throw Object.assign(new Error("Simulated rate limit"), { status: 429, headers: { "retry-after": "7" } });
    }
    const turns = normalizeHistory(input.messages);
    const last = turns[turns.length - 1];
    const files = last?.attachments.map((a) => `\`${a.name}\` (${a.kind})`).join(", ");
    const reply =
      `**Echo** from the mock provider (turn ${Math.ceil(turns.length / 2)}).\n\n` +
      (input.system ? `System prompt: _${input.system.slice(0, 80)}_\n\n` : "") +
      (files ? `Attachments: ${files}\n\n` : "") +
      `> ${last?.text || "(empty)"}\n\n` +
      "```ts\nconsole.log(\"streaming works\");\n```";
    for (const word of reply.split(/(?<=\s)/)) {
      await this.wait(input.signal);
      yield { type: "text", delta: word };
    }
    yield { type: "usage", usage: { inputTokens: 10, outputTokens: reply.length } };
    yield { type: "done", stopReason: "end_turn" };
  }

  /** Scripted agent: list files, then summarise. Exercises the full tool loop. */
  startAgent(): AgentSession {
    let step = 0;
    let lastResult = "";
    return {
      step: async (signal, onText) => {
        await this.wait(signal);
        step++;
        if (step === 1) {
          onText("Let me look at the workspace.");
          return { text: "Let me look at the workspace.", toolCalls: [{ id: "mock_1", name: "list_files", input: { path: "." } }], stopReason: "tool_use" };
        }
        const text = `The workspace contains:\n\n\`\`\`\n${lastResult || "(empty)"}\n\`\`\``;
        onText(text);
        return { text, toolCalls: [], stopReason: "end_turn" };
      },
      addToolResults(results) {
        lastResult = results.map((r) => r.output).join("\n");
      },
    };
  }
}
