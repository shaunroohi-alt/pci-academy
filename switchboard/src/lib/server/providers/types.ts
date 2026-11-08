import type { Message, ModelInfo, ProviderCapabilities, ProviderId, StreamEvent, Usage } from "@/lib/shared/types";

export interface ChatInput {
  model: string;
  system?: string;
  /** Full history, oldest first, ending with the newest user message. */
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  signal: AbortSignal;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema object describing the tool input. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Set when the model produced arguments that are not valid JSON. */
  parseError?: string;
}

export interface ToolResult {
  id: string;
  name: string;
  output: string;
  isError?: boolean;
}

export interface AgentStepResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason?: string;
  usage?: Usage;
}

/**
 * A tool-use loop session. The provider keeps its own native transcript so
 * provider-specific blocks (e.g. Claude thinking blocks) are replayed
 * unchanged and history stays append-only.
 */
export interface AgentSession {
  step(signal: AbortSignal, onText: (delta: string) => void): Promise<AgentStepResult>;
  addToolResults(results: ToolResult[]): void;
}

export interface AgentInput {
  model: string;
  system: string;
  tools: ToolSpec[];
  /** Prior plain-text turns, ending with the new user prompt. */
  messages: Message[];
  maxTokens?: number;
}

export interface ChatProvider {
  id: ProviderId;
  label: string;
  capabilities: ProviderCapabilities;
  configured(): boolean;
  /** Models to offer when the live list is unavailable. */
  fallbackModels(): { models: ModelInfo[]; source: "env" | "default" };
  /** Live model list from the provider API. May throw. */
  fetchModels?(): Promise<ModelInfo[]>;
  defaultModel(): string | undefined;
  stream(input: ChatInput): AsyncGenerator<StreamEvent>;
  startAgent?(input: AgentInput): AgentSession;
  note?(): string | undefined;
}

export function modelsFrom(ids: string[]): ModelInfo[] {
  return ids.map((id) => ({ id, label: id }));
}
