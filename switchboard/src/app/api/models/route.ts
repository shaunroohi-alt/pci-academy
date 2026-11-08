import { handleRouteError } from "@/lib/server/http";
import { providerStatuses } from "@/lib/server/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const live = new URL(req.url).searchParams.get("live") !== "0";
    return Response.json({ providers: await providerStatuses({ live }) });
  } catch (e) {
    return handleRouteError(e);
  }
}
