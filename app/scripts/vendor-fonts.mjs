// Downloads the Latin subsets of the two Classical typefaces and self-hosts them.
//
// The design depends on Cormorant Garamond and Lora; pulling them from the
// Google CDN at runtime means the packaged app renders in fallback system
// fonts until the network answers, and permanently when offline. Run this once
// and commit the result: npm run fonts:vendor
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'src/assets/fonts');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Lora:wght@400;600&display=swap';
// A modern desktop UA makes Google serve woff2 rather than legacy formats.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEEP = new Set(['latin', 'latin-ext']);

const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();

mkdirSync(outDir, { recursive: true });
const blocks = [];
// Each @font-face is preceded by a /* subset */ comment naming its unicode range.
const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
for (const [, subset, block] of css.matchAll(re)) {
  if (!KEEP.has(subset)) continue;
  const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
  if (!url || !family || !weight) continue;

  const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}-${subset}.woff2`;
  const bytes = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(resolve(outDir, file), bytes);
  blocks.push(block.replace(/url\(https:\/\/[^)]+\.woff2\)/, `url(../assets/fonts/${file})`));
  console.log(`${file}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

if (blocks.length === 0) throw new Error('No font faces matched — the Google CSS format may have changed.');

writeFileSync(
  resolve(root, 'src/styles/fonts.css'),
  `/* Self-hosted Latin subsets. Regenerate with: npm run fonts:vendor */\n\n${blocks.join('\n\n')}\n`,
);
console.log(`\nWrote src/styles/fonts.css with ${blocks.length} faces.`);
