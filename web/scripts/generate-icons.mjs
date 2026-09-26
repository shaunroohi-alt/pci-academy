// Generates the PWA and Apple touch icons from public/icon.svg.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public', 'icon.svg'))
const out = (name) => join(root, 'public', 'icons', name)

await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'))
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'))
await sharp(svg).resize(180, 180).flatten({ background: '#1f1e1c' }).png().toFile(out('apple-touch-icon.png'))
// Maskable: the mark inside the 80% safe zone on a full-bleed ground.
const mark = await sharp(svg).resize(360, 360).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1f1e1c' } })
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toFile(out('maskable-512.png'))
console.log('icons written')
