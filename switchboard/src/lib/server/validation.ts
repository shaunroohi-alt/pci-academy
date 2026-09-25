import { z } from "zod";
import { PROVIDER_IDS, type Attachment, type AttachmentKind } from "@/lib/shared/types";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function kindFor(mimeType: string, name: string): AttachmentKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return "image";
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (
    mimeType.startsWith("text/") ||
    /(json|xml|yaml|javascript|typescript|x-sh|x-python|csv|markdown|toml|sql)/.test(mimeType) ||
    /\.(txt|md|markdown|json|ya?ml|toml|csv|tsv|xml|html?|css|scss|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|env\.example|ini|cfg|conf|log|diff|patch)$/i.test(name)
  ) {
    return "text";
  }
  return null;
}

export const attachmentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(128),
  size: z.number().int().nonnegative(),
  kind: z.enum(["image", "pdf", "text"]),
  data: z.string(),
});

export const settingsSchema = z.object({
  provider: z.enum(PROVIDER_IDS as [string, ...string[]]),
  model: z.string().min(1).max(200),
  systemPrompt: z.string().max(100_000).default(""),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(1_000_000).optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  settings: settingsSchema,
  message: z.object({ content: z.string().max(500_000), attachments: z.array(attachmentSchema).max(10).default([]) }).optional(),
  regenerate: z.boolean().optional(),
});

/** Byte size of a base64 payload without decoding it. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export function validateAttachments(list: Attachment[], maxBytes: number): string | null {
  for (const a of list) {
    const expected = kindFor(a.mimeType, a.name);
    if (!expected || expected !== a.kind) return `Unsupported attachment type for "${a.name}" (${a.mimeType || "unknown"}).`;
    const bytes = a.kind === "text" ? Buffer.byteLength(a.data, "utf8") : base64Bytes(a.data);
    if (a.kind !== "text" && !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)) return `Attachment "${a.name}" is not valid base64.`;
    if (bytes > maxBytes) return `Attachment "${a.name}" exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`;
  }
  return null;
}
