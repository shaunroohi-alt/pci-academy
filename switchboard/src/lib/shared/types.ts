// Types shared by the browser and the server. Nothing in here may hold secrets.

export type ProviderId = "anthropic" | "openai" | "gemini" | "astra" | "mock";

export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "gemini", "astra", "mock"];

export type AttachmentKind = "image" | "pdf" | "text";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /** base64 payload (no data: prefix) for image/pdf, UTF-8 text for text files. */
  data: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  provider?: ProviderId;
  model?: string;
  createdAt: string;
  usage?: Usage;
  /** Set when generation failed; content holds whatever streamed before the failure. */
  error?: string;
  /** True when the user stopped generation early. */
  stopped?: boolean;
}

export interface ChatSettings {
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  /** undefined = provider default (some reasoning models reject custom temperature). */
  temperature?: number;
  maxTokens?: number;
}

export interface Conversation extends ChatSettings {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  provider: ProviderId;
  model: string;
  updatedAt: string;
  messageCount: number;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProviderCapabilities {
  images: boolean;
  pdf: boolean;
  tools: boolean;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  capabilities: ProviderCapabilities;
  models: ModelInfo[];
  /** Where the model list came from: live API call, env override or built-in defaults. */
  modelSource: "api" | "env" | "default";
  defaultModel?: string;
  note?: string;
}

export type ErrorCode =
  | "rate_limited"
  | "auth"
  | "overloaded"
  | "bad_request"
  | "not_found"
  | "not_configured"
  | "network"
  | "aborted"
  | "unknown";

export interface AppError {
  code: ErrorCode;
  message: string;
  status: number;
  retryAfterSeconds?: number;
}

/** Events streamed from /api/chat and the workspace agent. */
export type StreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string; assistantMessageId: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output: string; isError?: boolean }
  | { type: "log"; stream: "stdout" | "stderr" | "info"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "error"; error: AppError }
  | { type: "done"; stopReason?: string };

export interface WorkspaceEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface PublicConfig {
  appName: string;
  shellEnabled: boolean;
  claudeCodeCliEnabled: boolean;
  maxAttachmentBytes: number;
  defaultProvider?: ProviderId;
  defaultModel?: string;
  astraLabel: string;
}
