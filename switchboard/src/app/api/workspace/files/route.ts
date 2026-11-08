import { z } from "zod";
import { jsonError } from "@/lib/server/errors";
import { handleRouteError, readJson } from "@/lib/server/http";
import { SandboxError } from "@/lib/server/workspace/sandbox";
import { workspaceRoot } from "@/lib/server/workspace/root";
import { listEntries, readWorkspaceFile, writeWorkspaceFile } from "@/lib/server/workspace/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sandboxAware(e: unknown) {
  if (e instanceof SandboxError) return jsonError({ code: "bad_request", message: e.message, status: 400 });
  if ((e as NodeJS.ErrnoException).code === "ENOENT") return jsonError({ code: "not_found", message: "File not found.", status: 404 });
  return handleRouteError(e);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const root = await workspaceRoot();
    const p = url.searchParams.get("path") ?? ".";
    if (url.searchParams.get("read") === "1") {
      return Response.json({ path: p, content: await readWorkspaceFile(root, p) });
    }
    return Response.json({ root: "workspace", entries: await listEntries(root, p, true) });
  } catch (e) {
    return sandboxAware(e);
  }
}

const putSchema = z.object({ path: z.string().min(1).max(1024), content: z.string().max(5_000_000) });

export async function PUT(req: Request) {
  try {
    const parsed = putSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError({ code: "bad_request", message: "path and content are required.", status: 400 });
    await writeWorkspaceFile(await workspaceRoot(), parsed.data.path, parsed.data.content);
    return Response.json({ ok: true });
  } catch (e) {
    return sandboxAware(e);
  }
}
