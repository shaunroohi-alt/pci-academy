import type { MetadataRoute } from 'next'
import { hrefFor, published, SEED_CONTENT } from '@/lib/content/catalog'

// Static export: emitted as /sitemap.xml at build time.
export const dynamic = 'force-static'

// The production origin. Mirrors content/site.ts (SITE.url) and web/public/CNAME;
// NEXT_PUBLIC_APP_URL overrides it for a preview host.
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://pci.academy').replace(/\/+$/, '')

/** The public site (website handoff, 02-PAGES-AND-COPY.md). Member tools, Account and Admin are not listed. */
const PUBLIC_ROUTES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/art-of-being/', priority: 0.9 },
  { path: '/library/', priority: 0.9 },
  { path: '/method/', priority: 0.8 },
  { path: '/academy/', priority: 0.6 },
  { path: '/practitioners/', priority: 0.6 },
  { path: '/boundary/', priority: 0.6 },
  { path: '/enter/', priority: 0.3 },
]

// Collections whose published items are public reading. Compared as strings so
// this file compiles while the Collection union is still being extended.
const PUBLIC_COLLECTIONS: ReadonlySet<string> = new Set(['art-of-being', 'companion', 'library'])

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'monthly',
    priority,
  }))

  const texts: MetadataRoute.Sitemap = published(SEED_CONTENT)
    .filter((item) => PUBLIC_COLLECTIONS.has(item.collection as string))
    .map((item) => ({
      url: `${SITE_URL}${hrefFor(item)}`,
      lastModified: item.published_at ?? item.updated_at,
      changeFrequency: 'yearly',
      priority: 0.7,
    }))

  // One entry per URL, in a stable order.
  const seen = new Set<string>()
  return [...pages, ...texts].filter((entry) => (seen.has(entry.url) ? false : (seen.add(entry.url), true)))
}
