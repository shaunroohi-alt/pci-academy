import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PCI Academy',
    short_name: 'PCI',
    description: 'Psycho-Creative Intelligence — read, document, observe. Visibility is the output.',
    id: `${base}/`,
    start_url: `${base}/today/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#faf8f3',
    theme_color: '#0e0d0b',
    categories: ['education', 'books', 'productivity'],
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${base}/icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
