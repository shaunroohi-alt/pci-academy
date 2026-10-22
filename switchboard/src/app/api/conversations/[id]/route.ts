import { z } from "zod";
import { getConfig } from "@/lib/server/config";
import { jsonError } from "@/lib/server/errors";
import { handleRouteError, readJson } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { settingsSchema } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => jsonError({ code: "not_found", message: "Conversation not found.", status: 404 });
const validId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!validId(id)) return notFound();
    const conv = await getStore(getConfig().dataDir).get(id);
    return conv ? Response.json({ conversation: conv }) : notFound();
  } catch (e) {
    return handleRouteError(e);
  }
}

const patchSchema = settingsSchema.partial().extend({ title: z.string().min(1).max(200).optional() });

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!validId(id)) return notFound();
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError({ code: "bad_request", message: parsed.error.message, status: 400 });
    const conv = await getStore(getConfig().dataDir).update(id, (c) => {
      Object.assign(c, Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)));
    });
    return conv ? Response.json({ conversation: conv }) : notFound();
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!validId(id)) return notFound();
    return (await getStore(getConfig().dataDir).delete(id)) ? new Response(null, { status: 204 }) : notFound();
  } catch (e) {
    return handleRouteError(e);
  }
}
