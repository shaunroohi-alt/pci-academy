import { getConfig } from "@/lib/server/config";
import { toAppError } from "@/lib/server/errors";
import { getProviders } from "@/lib/server/providers";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness. Public (no auth) so Docker/orchestrators can probe it,
 * therefore it only reports booleans — never keys, URLs or model lists.
 * `?deep=1` additionally makes one cheap authenticated call per configured provider.
 */
export async function GET(req: Request) {
  const cfg = getConfig();
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const storageOk = await getStore(cfg.dataDir).probe();
  const providers: Record<string, { configured: boolean; reachable?: boolean; error?: string }> = {};
  await Promise.all(
    [...getProviders().values()].map(async (p) => {
      const entry: (typeof providers)[string] = { configured: p.configured() };
      if (deep && p.configured() && p.fetchModels) {
        try {
          await Promise.race([p.fetchModels(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]);
          entry.reachable = true;
        } catch (e) {
          entry.reachable = false;
          entry.error = toAppError(e).code;
        }
      }
      providers[p.id] = entry;
    }),
  );
  const ok = storageOk;
  return Response.json(
    { status: ok ? "ok" : "degraded", time: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()), storage: storageOk ? "writable" : "unwritable", providers },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
