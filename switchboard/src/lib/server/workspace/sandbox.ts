import { promises as fs } from "node:fs";
import path from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolve a user/model supplied path to an absolute path that is guaranteed to
 * stay inside the workspace root — including after following symlinks.
 */
export async function resolveInWorkspace(root: string, relPath: string | undefined): Promise<string> {
  const rootReal = await fs.realpath(root);
  const input = (relPath ?? ".").trim() || ".";
  if (input.includes("\0")) throw new SandboxError("Invalid path.");
  const target = path.resolve(rootReal, input.replace(/^[/\\]+/, ""));
  if (!isInside(rootReal, target)) throw new SandboxError(`Path escapes the workspace: ${input}`);

  // Follow symlinks on the deepest existing ancestor to catch link-based escapes.
  let probe = target;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      if (!isInside(rootReal, real)) throw new SandboxError(`Path escapes the workspace via a symlink: ${input}`);
      break;
    } catch (e) {
      if (e instanceof SandboxError) throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return target;
}

export function toRelative(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/") || ".";
}

export const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", "venv"]);
