import { promises as fs } from "node:fs";
import { z } from "zod";
import { getConfig } from "@/lib/server/config";
import { jsonError } from "@/lib/server/errors";
import { checkRateLimit, handleRouteError, readJson, sseResponse } from "@/lib/server/http";
import { runCommand } from "@/lib/server/workspace/exec";
import { workspaceRoot } from "@/lib/server/workspace/root";

export const runtime = "nodejs";

const schema = z.object({ command: z.string().min(1).max(10_000) });

export async function POST(req: Request) {
  const cfg = getConfig();
  if (!cfg.shellEnabled) return jsonError({ code: "bad_request", message: "Shell access is disabled. Set ENABLE_SHELL=true to enable the terminal.", status: 403 });
  const limited = checkRateLimit(req);
  if (limited) return limited;
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError({ code: "bad_request", message: "command is required.", status: 400 });
    const cwd = await fs.realpath(await workspaceRoot());
    return sseResponse(req, async (emit, signal) => {
      const r = await runCommand(parsed.data.command, cwd, {
        timeoutMs: cfg.shellTimeoutMs,
        signal,
        onData: (text, stream) => emit({ type: "log", stream, text }),
      });
      if (r.timedOut) emit({ type: "log", stream: "stderr", text: `\n[timed out after ${cfg.shellTimeoutMs}ms]\n` });
      emit({ type: "done", stopReason: `exit ${r.exitCode}` });
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
