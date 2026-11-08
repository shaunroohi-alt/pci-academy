import { getConfig } from "@/lib/server/config";
import { jsonError, ProviderError, toAppError } from "@/lib/server/errors";
import { checkRateLimit, handleRouteError, readJson, sseResponse } from "@/lib/server/http";
import { getProvider } from "@/lib/server/providers";
import { getStore, newId, titleFrom } from "@/lib/server/store";
import { chatRequestSchema, validateAttachments } from "@/lib/server/validation";
import type { Attachment, Conversation, Message, Usage } from "@/lib/shared/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;
  try {
    const parsed = chatRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      return jsonError({ code: "bad_request", status: 400, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
    const body = parsed.data;
    const cfg = getConfig();
    const provider = getProvider(body.settings.provider);
    if (!provider) throw new ProviderError("bad_request", `Unknown or disabled provider: ${body.settings.provider}`, 400);
    if (!provider.configured()) throw new ProviderError("not_configured", `${provider.label} is not configured. Add its credentials to .env and restart.`, 400);

    const attachments = (body.message?.attachments ?? []) as Attachment[];
    const attErr = validateAttachments(attachments, cfg.maxAttachmentBytes);
    if (attErr) throw new ProviderError("bad_request", attErr, 400);
    if (!body.regenerate && !body.message?.content.trim() && !attachments.length) {
      throw new ProviderError("bad_request", "Message is empty.", 400);
    }

    const store = getStore(cfg.dataDir);
    const now = new Date().toISOString();
    const settings = {
      provider: provider.id,
      model: body.settings.model,
      systemPrompt: body.settings.systemPrompt ?? "",
      temperature: body.settings.temperature,
      maxTokens: body.settings.maxTokens,
    };

    let conv: Conversation | null = body.conversationId ? await store.get(body.conversationId) : null;
    if (body.conversationId && !conv && body.regenerate) throw new ProviderError("not_found", "Conversation not found.", 404);
    if (!conv) {
      conv = { id: body.conversationId ?? newId(), title: titleFrom(body.message?.content || attachments[0]?.name || ""), createdAt: now, updatedAt: now, messages: [], ...settings };
    }
    Object.assign(conv, settings, { updatedAt: now });

    if (body.regenerate) {
      while (conv.messages.length && conv.messages[conv.messages.length - 1].role === "assistant") conv.messages.pop();
      if (!conv.messages.length) throw new ProviderError("bad_request", "Nothing to regenerate.", 400);
    } else {
      conv.messages.push({ id: newId(), role: "user", content: body.message!.content, attachments: attachments.length ? attachments : undefined, createdAt: now });
    }
    const userMessageId = conv.messages[conv.messages.length - 1].id;
    await store.save(conv);
    const convId = conv.id;
    const history = [...conv.messages];
    const assistantId = newId();

    return sseResponse(req, async (emit, signal) => {
      emit({ type: "meta", conversationId: convId, userMessageId, assistantMessageId: assistantId });
      let content = "";
      let usage: Usage | undefined;
      let error: string | undefined;
      let stopped = false;
      try {
        for await (const ev of provider.stream({ model: settings.model, system: settings.systemPrompt || undefined, messages: history, temperature: settings.temperature, maxTokens: settings.maxTokens, signal })) {
          if (ev.type === "text") content += ev.delta;
          if (ev.type === "usage") usage = ev.usage;
          emit(ev);
        }
      } catch (e) {
        const appErr = toAppError(e);
        if (appErr.code === "aborted" || signal.aborted) stopped = true;
        else {
          error = appErr.message;
          emit({ type: "error", error: appErr });
        }
      } finally {
        if (content || error) {
          const msg: Message = { id: assistantId, role: "assistant", content, provider: provider.id, model: settings.model, createdAt: new Date().toISOString(), usage, error, stopped: stopped || undefined };
          await store.update(convId, (c) => {
            c.messages.push(msg);
          });
        }
      }
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
