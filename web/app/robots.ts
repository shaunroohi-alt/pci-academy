import type { MetadataRoute } from 'next'

// Static export: emitted as /robots.txt at build time.
export const dynamic = 'force-static'

// The production origin. Mirrors content/site.ts (SITE.url) and web/public/CNAME;
// NEXT_PUBLIC_APP_URL overrides it for a preview host.
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://pci.academy').replace(/\/+$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Member and administrative rooms are private: nothing there is for an index.
        disallow: ['/admin/', '/account/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
