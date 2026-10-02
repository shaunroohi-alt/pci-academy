import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/app-shell'
import { ServiceWorker } from '@/components/service-worker'
import { PALETTE, SITE } from '@/content/site'
import { AppProvider, THEME_BOOTSTRAP } from '@/lib/app/context'
import './globals.css'

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: { default: `${SITE.name} · ${SITE.book}`, template: `%s · ${SITE.name}` },
  description: 'PCI is an observational method. It separates what happened from what was decided about it. It reports what can be seen. Then it stops. The direction is yours.',
  applicationName: SITE.name,
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icon.svg`, apple: `${base}/icons/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: 'default' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: PALETTE.paper },
    { media: '(prefers-color-scheme: dark)', color: PALETTE.dark },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
          <ServiceWorker />
        </AppProvider>
      </body>
    </html>
  )
}
