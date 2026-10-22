import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { WorkspaceEntry } from "@/lib/shared/types";
import type { ToolSpec } from "@/lib/server/providers/types";
import { runCommand } from "./exec";
import { IGNORED_DIRS, resolveInWorkspace, SandboxError, toRelative } from "./sandbox";

const MAX_READ_BYTES = 256 * 1024;
const MAX_LIST = 500;

export interface ToolContext {
  root: string;
  shellEnabled: boolean;
  shellTimeoutMs: number;
  signal?: AbortSignal;
}

export async function listEntries(root: string, rel = ".", recursive = true): Promise<WorkspaceEntry[]> {
  const base = await resolveInWorkspace(root, rel);
  const rootReal = await fs.realpath(root);
  const out: WorkspaceEntry[] = [];
  async function walk(dir: string, depth: number) {
    if (out.length >= MAX_LIST) return;
    const items = await fs.readdir(dir, { withFileTypes: true });
    items.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const it of items) {
      if (out.length >= MAX_LIST) return;
      if (it.isDirectory() && IGNORED_DIRS.has(it.name)) continue;
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) {
        out.push({ path: toRelative(rootReal, abs), type: "dir" });
        if (recursive && depth < 8) await walk(abs, depth + 1);
      } else if (it.isFile()) {
        const st = await fs.stat(abs);
        out.push({ path: toRelative(rootReal, abs), type: "file", size: st.size });
      }
    }
  }
  await walk(base, 0);
  return out;
}

export async function readWorkspaceFile(root: string, rel: string): Promise<string> {
  const abs = await resolveInWorkspace(root, rel);
  const st = await fs.stat(abs);
  if (!st.isFile()) throw new SandboxError(`Not a file: ${rel}`);
  const fh = await fs.open(abs, "r");
  try {
    const buf = Buffer.alloc(Math.min(st.size, MAX_READ_BYTES));
    await fh.read(buf, 0, buf.length, 0);
    if (buf.includes(0)) throw new SandboxError(`${rel} looks like a binary file.`);
    const text = buf.toString("utf8");
    return st.size > MAX_READ_BYTES ? `${text}\n\n[truncated: file is ${st.size} bytes]` : text;
  } finally {
    await fh.close();
  }
}

export async function writeWorkspaceFile(root: string, rel: string, content: string): Promise<void> {
  const abs = await resolveInWorkspace(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

const schemas = {
  list_files: z.object({ path: z.string().optional(), recursive: z.boolean().optional() }),
  read_file: z.object({ path: z.string(), start_line: z.number().int().positive().optional(), end_line: z.number().int().positive().optional() }),
  write_file: z.object({ path: z.string(), content: z.string() }),
  edit_file: z.object({ path: z.string(), old_string: z.string().min(1), new_string: z.string() }),
  search: z.object({ pattern: z.string().min(1), path: z.string().optional() }),
  run_command: z.object({ command: z.string().min(1) }),
};

export type ToolName = keyof typeof schemas;

export function toolSpecs(shellEnabled: boolean): ToolSpec[] {
  const specs: ToolSpec[] = [
    {
      name: "list_files",
      description: "List files and directories in the workspace (recursive by default, skips .git/node_modules). Paths are relative to the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory relative to the workspace root. Defaults to '.'." },
          recursive: { type: "boolean", description: "Recurse into subdirectories. Default true." },
        },
      },
    },
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the workspace, optionally a 1-indexed inclusive line range. Output lines are prefixed with line numbers.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          start_line: { type: "integer", minimum: 1 },
          end_line: { type: "integer", minimum: 1 },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Create or overwrite a file in the workspace with the full given content. Parent directories are created.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
    {
      name: "edit_file",
      description: "Replace exactly one occurrence of old_string with new_string in a file. Fails if old_string is missing or not unique; include enough context to make it unique.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } },
        required: ["path", "old_string", "new_string"],
      },
    },
    {
      name: "search",
      description: "Search workspace text files for a JavaScript regular expression. Returns up to 100 matches as path:line: text.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" }, path: { type: "string", description: "Directory to search. Default '.'." } },
        required: ["pattern"],
      },
    },
  ];
  if (shellEnabled) {
    specs.push({
      name: "run_command",
      description: "Run a shell command (sh -c) in the workspace root and return combined stdout/stderr and the exit code. Use for builds, tests, git and package managers.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    });
  }
  return specs;
}

/** Execute one tool call. Always resolves; failures are reported as `isError`. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ output: string; isError: boolean }> {
  try {
    if (!(name in schemas)) return { output: `Unknown tool: ${name}`, isError: true };
    const parsed = schemas[name as ToolName].safeParse(rawInput);
    if (!parsed.success) {
      return { output: `Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true };
    }
    const input = parsed.data as Record<string, unknown>;
    switch (name as ToolName) {
      case "list_files": {
        const entries = await listEntries(ctx.root, input.path as string | undefined, (input.recursive as boolean | undefined) ?? true);
        if (!entries.length) return { output: "(empty)", isError: false };
        const lines = entries.map((e) => (e.type === "dir" ? `${e.path}/` : `${e.path} (${e.size} B)`));
        if (entries.length >= MAX_LIST) lines.push(`[listing capped at ${MAX_LIST} entries]`);
        return { output: lines.join("\n"), isError: false };
      }
      case "read_file": {
        const text = await readWorkspaceFile(ctx.root, input.path as string);
        const all = text.split("\n");
        const start = (input.start_line as number | undefined) ?? 1;
        const end = Math.min((input.end_line as number | undefined) ?? all.length, all.length);
        const body = all.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(5)}  ${l}`).join("\n");
        return { output: body || "(empty file)", isError: false };
      }
      case "write_file": {
        await writeWorkspaceFile(ctx.root, input.path as string, input.content as string);
        return { output: `Wrote ${Buffer.byteLength(input.content as string)} bytes to ${input.path}`, isError: false };
      }
      case "edit_file": {
        const text = await readWorkspaceFile(ctx.root, input.path as string);
        const oldS = input.old_string as string;
        const count = text.split(oldS).length - 1;
        if (count === 0) return { output: `old_string not found in ${input.path}`, isError: true };
        if (count > 1) return { output: `old_string occurs ${count} times in ${input.path}; add more context`, isError: true };
        await writeWorkspaceFile(ctx.root, input.path as string, text.replace(oldS, () => input.new_string as string));
        return { output: `Edited ${input.path}`, isError: false };
      }
      case "search": {
        let re: RegExp;
        try {
          re = new RegExp(input.pattern as string);
        } catch (e) {
          return { output: `Invalid regex: ${(e as Error).message}`, isError: true };
        }
        const entries = (await listEntries(ctx.root, (input.path as string | undefined) ?? ".", true)).filter((e) => e.type === "file" && (e.size ?? 0) < MAX_READ_BYTES);
        const hits: string[] = [];
        for (const e of entries) {
          if (hits.length >= 100) break;
          let text: string;
          try {
            text = await readWorkspaceFile(ctx.root, e.path);
          } catch {
            continue;
          }
          text.split("\n").forEach((line, i) => {
            if (hits.length < 100 && re.test(line)) hits.push(`${e.path}:${i + 1}: ${line.slice(0, 300)}`);
          });
        }
        return { output: hits.length ? hits.join("\n") : "No matches.", isError: false };
      }
      case "run_command": {
        if (!ctx.shellEnabled) return { output: "Shell access is disabled (set ENABLE_SHELL=true).", isError: true };
        const r = await runCommand(input.command as string, await fs.realpath(ctx.root), { timeoutMs: ctx.shellTimeoutMs, signal: ctx.signal });
        const status = r.timedOut ? `timed out after ${ctx.shellTimeoutMs}ms` : `exit code ${r.exitCode}`;
        return { output: `${r.output}${r.truncated ? "\n[output truncated]" : ""}\n[${status}]`, isError: r.exitCode !== 0 };
      }
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const msg = err.code === "ENOENT" ? `Not found: ${(rawInput as { path?: string })?.path ?? ""}` : err.message;
    return { output: msg, isError: true };
  }
  return { output: "Unhandled tool", isError: true };
}
