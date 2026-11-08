import type { Attachment, Message } from "@/lib/shared/types";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  attachments: Attachment[];
}

/**
 * Turn stored messages into a clean alternating transcript:
 * - failed/empty assistant replies are dropped,
 * - consecutive same-role turns are merged (every provider accepts that shape),
 * - the transcript always starts with a user turn.
 */
export function normalizeHistory(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    const text = m.content ?? "";
    const attachments = m.attachments ?? [];
    if (m.role === "assistant" && !text.trim()) continue;
    if (m.role === "user" && !text.trim() && attachments.length === 0) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) {
      last.text = [last.text, text].filter((s) => s.trim()).join("\n\n");
      last.attachments = [...last.attachments, ...attachments];
    } else {
      turns.push({ role: m.role, text, attachments: [...attachments] });
    }
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

export function textFileBlock(a: Attachment): string {
  return `<file name="${a.name.replace(/"/g, "'")}">\n${a.data}\n</file>`;
}

export function unsupportedNote(a: Attachment, provider: string): string {
  return `[Attachment "${a.name}" (${a.mimeType}) was not sent: ${provider} does not accept this file type.]`;
}
