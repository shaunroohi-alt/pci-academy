"use client";

import type { Attachment, AttachmentKind } from "@/lib/shared/types";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const TEXT_EXT = /\.(txt|md|markdown|json|ya?ml|toml|csv|tsv|xml|html?|css|scss|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|ini|cfg|conf|log|diff|patch)$/i;

export function attachmentKind(file: File): AttachmentKind | null {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("text/") || /(json|xml|yaml|javascript|typescript)/.test(file.type) || TEXT_EXT.test(file.name)) return "text";
  return null;
}

function mimeFor(file: File, kind: AttachmentKind): string {
  if (file.type) return file.type;
  if (kind === "pdf") return "application/pdf";
  return "text/plain";
}

export async function fileToAttachment(file: File, maxBytes: number): Promise<Attachment> {
  const kind = attachmentKind(file);
  if (!kind) throw new Error(`"${file.name}" is not a supported type (images, PDFs and text/code files).`);
  if (file.size > maxBytes) throw new Error(`"${file.name}" is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  let data: string;
  if (kind === "text") {
    data = await file.text();
  } else {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    data = btoa(bin);
  }
  return { id: crypto.randomUUID().slice(0, 12), name: file.name, mimeType: mimeFor(file, kind), size: file.size, kind, data };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
