// Ship corresponding source with the browser application, including rebuild
// instructions for the pinned WASM engine. Model weights are separately served.
import JSZip from "jszip";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const archive = new JSZip();
const allowed = [
  "src",
  "scripts",
  "public/licenses",
  "public/stems",
  "public/models/manifest.json",
  "public/icon.svg",
  "docs",
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  ".gitignore",
];
async function add(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOTDIR") {
      archive.file(`brain-storm/${path}`, await readFile(path));
      return;
    }
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const next = join(path, entry.name);
    if (entry.isDirectory()) await add(next);
    else if (!next.endsWith(".wasm"))
      archive.file(`brain-storm/${next}`, await readFile(next));
  }
}
for (const path of allowed) await add(path);
await mkdir("dist", { recursive: true });
await writeFile(
  "dist/source.zip",
  await archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  }),
);
