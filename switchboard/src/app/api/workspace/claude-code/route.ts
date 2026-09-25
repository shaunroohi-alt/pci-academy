import { promises as fs } from "node:fs";
import { z } from "zod";
import { getConfig } from "@/lib/server/config";
import { jsonError } from "@/lib/server/errors";
import { checkRateLimit, handleRouteError, readJson, sseResponse } from "@/lib/server/http";
import { runClaudeCode } from "@/lib/server/workspace/claude-code";
import { workspaceRoot } from "@/lib/server/workspace/root";

export const runtime = "nodejs";

const schema = z.object({ prompt: z.string().min(1).max(200_000) });

export async function POST(req: Request) {
  const cfg = getConfig();
  if (!cfg.claudeCodeCli.enabled) {
    return jsonError({ code: "bad_request", message: "The Claude Code CLI bridge is disabled. Install Claude Code and set ENABLE_CLAUDE_CODE_CLI=true.", status: 403 });
  }
  const limited = checkRateLimit(req);
  if (limited) return limited;
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError({ code: "bad_request", message: "prompt is required.", status: 400 });
    const cwd = await fs.realpath(await workspaceRoot());
    return sseResponse(req, async (emit, signal) => {
      const code = await runClaudeCode({ bin: cfg.claudeCodeCli.bin, args: cfg.claudeCodeCli.args, prompt: parsed.data.prompt, cwd, signal, emit });
      emit({ type: "done", stopReason: `exit ${code}` });
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
