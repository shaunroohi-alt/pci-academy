import { getConfig } from "@/lib/server/config";
import { handleRouteError } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ conversations: await getStore(getConfig().dataDir).list() });
  } catch (e) {
    return handleRouteError(e);
  }
}
