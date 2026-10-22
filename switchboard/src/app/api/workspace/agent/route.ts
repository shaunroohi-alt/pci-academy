import { z } from "zod";
import { getConfig } from "@/lib/server/config";
import { jsonError, ProviderError } from "@/lib/server/errors";
import { checkRateLimit, handleRouteError, readJson, sseResponse } from "@/lib/server/http";
import { getProvider } from "@/lib/server/providers";
import { runAgent } from "@/lib/server/workspace/agent";
import { workspaceRoot } from "@/lib/server/workspace/root";
import { PROVIDER_IDS, type Message } from "@/lib/shared/types";

export const runtime = "nodejs";

const schema = z.object({
  provider: z.enum(PROVIDER_IDS as [string, ...string[]]),
  model: z.string().min(1).max(200),
  systemPrompt: z.string().max(50_000).optional(),
  maxTokens: z.number().int().positive().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(500_000) })).min(1).max(200),
});

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError({ code: "bad_request", message: parsed.error.message, status: 400 });
    const body = parsed.data;
    const cfg = getConfig();
    const provider = getProvider(body.provider);
    if (!provider) throw new ProviderError("bad_request", `Unknown or disabled provider: ${body.provider}`, 400);
    if (!provider.configured()) throw new ProviderError("not_configured", `${provider.label} is not configured.`, 400);
    if (!provider.startAgent || !provider.capabilities.tools) throw new ProviderError("bad_request", `${provider.label} does not support tool calling here.`, 400);
    const root = await workspaceRoot();
    const messages: Message[] = body.messages.map((m, i) => ({ id: `m${i}`, role: m.role, content: m.content, createdAt: "" }));

    return sseResponse(req, async (emit, signal) => {
      await runAgent({
        provider,
        model: body.model,
        messages,
        systemPrompt: body.systemPrompt,
        maxSteps: cfg.maxAgentSteps,
        maxTokens: body.maxTokens,
        ctx: { root, shellEnabled: cfg.shellEnabled, shellTimeoutMs: cfg.shellTimeoutMs },
        signal,
        emit,
      });
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
