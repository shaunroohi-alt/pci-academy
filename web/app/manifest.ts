import type { MetadataRoute } from 'next'
import { PALETTE, SITE } from '@/content/site'

export const dynamic = 'force-static'

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} · ${SITE.book}`,
    short_name: SITE.name,
    description: 'PCI is an observational method. It separates what happened from what was decided about it. It reports what can be seen. Then it stops. The direction is yours.',
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: PALETTE.paper,
    theme_color: PALETTE.paper,
    categories: ['education', 'books'],
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${base}/icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
