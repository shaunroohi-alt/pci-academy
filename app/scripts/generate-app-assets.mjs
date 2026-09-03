// Generates the iOS app icon and launch image from the Classical design tokens.
//
// The mark is the app's own selector motif — the concentric ring used for a
// chosen intention on the onboarding screen — drawn large. Ink ground, gold
// mark, matching the Colophon treatment. Run: npm run assets:ios
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const INK = '#201f1d';
const CREAM = '#f3f2f2';
const GOLD = '#b68235';

/** Concentric attention mark: outer ring + core, separated by the ground colour. */
function mark({ size, ground, ink, cx = size / 2, cy = size / 2, r = size * 0.293 }) {
  // Proportions taken from the selector chip: thin outer ring, generous gap, solid core.
  const ringInner = r * 0.773;
  const coreRadius = r * 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ground}"/>
  <path fill="${ink}" fill-rule="evenodd"
        d="M ${cx} ${cy - r} a ${r} ${r} 0 1 0 0.001 0 z
           M ${cx} ${cy - ringInner} a ${ringInner} ${ringInner} 0 1 1 -0.001 0 z"/>
  <circle cx="${cx}" cy="${cy}" r="${coreRadius}" fill="${ink}"/>
</svg>`;
}

async function png(svg, out, size) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .flatten({ background: '#ffffff' }) // App Store icons must be fully opaque
    .toFile(out);
  return out;
}

const icons = resolve(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const splash = resolve(root, 'ios/App/App/Assets.xcassets/Splash.imageset');

// App icon — gold mark on ink, no transparency, no pre-rounded corners (iOS masks it).
await png(mark({ size: 1024, ground: INK, ink: GOLD }), resolve(icons, 'AppIcon-512@2x.png'), 1024);

// Launch image — cream ground so it dissolves into the Welcome screen, mark held small.
const splashSvg = mark({ size: 2732, ground: CREAM, ink: GOLD, r: 2732 * 0.075 });
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await png(splashSvg, resolve(splash, name), 2732);
}

// Web favicon, same mark, so browser tab and home screen agree.
writeFileSync(resolve(root, 'public/favicon.svg'), mark({ size: 512, ground: INK, ink: GOLD }));

console.log('Generated app icon, launch image and favicon.');
