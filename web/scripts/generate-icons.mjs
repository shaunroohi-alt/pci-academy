// Generates the seal, favicon, PWA and Apple touch icons from the gold-on-black
// PCI artwork in brand-source/. The fine-line mark is vector (public/brand/pci-mark.svg).
import sharp from 'sharp'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'brand-source', 'pci-logo-gold-black.png')
const pub = (...p) => join(root, 'public', ...p)
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 }

// Square crop centred on the seal, tips of the diamond included.
const square = await sharp(src).extract({ left: 78, top: 30, width: 1760, height: 1760 }).png().toBuffer()
const circleMask = (n) => Buffer.from(`<svg width="${n}" height="${n}"><circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}"/></svg>`)
const onBlack = async (n, inner) => {
  const mark = await sharp(square).resize(inner, inner).png().toBuffer()
  return sharp({ create: { width: n, height: n, channels: 4, background: BLACK } }).composite([{ input: mark, gravity: 'center' }])
}

// Round seal for the header and other small placements (transparent outside the disc).
for (const n of [64, 128]) {
  await sharp(square).resize(n, n).composite([{ input: circleMask(n), blend: 'dest-in' }]).png().toFile(pub('brand', `pci-seal-${n}.png`))
}

await (await onBlack(32, 30)).png().toFile(pub('favicon-32.png'))
await (await onBlack(192, 176)).png().toFile(pub('icons', 'icon-192.png'))
await (await onBlack(512, 470)).png().toFile(pub('icons', 'icon-512.png'))
await (await onBlack(180, 164)).png().toFile(pub('icons', 'apple-touch-icon.png'))
// Maskable: the seal inside the 80% safe zone on a full-bleed ground.
await (await onBlack(512, 380)).png().toFile(pub('icons', 'maskable-512.png'))
// Open Graph / share image: the fine-line logo on cream.
await sharp(join(root, 'brand-source', 'pci-logo-line.png')).extract({ left: 166, top: 206, width: 1600, height: 1400 }).resize(1200, 1050).flatten({ background: '#faf8f3' })
  .extend({ left: 0, right: 0, top: 0, bottom: 0 }).resize(1200, 630, { fit: 'contain', background: '#faf8f3' }).jpeg({ quality: 86 }).toFile(pub('brand', 'og.jpg'))
console.log('icons written')
