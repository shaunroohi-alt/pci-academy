import { promises as fs } from "node:fs";
import { getConfig } from "@/lib/server/config";

export async function workspaceRoot(): Promise<string> {
  const dir = getConfig().workspaceDir;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
