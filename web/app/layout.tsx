import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/app-shell'
import { ServiceWorker } from '@/components/service-worker'
import { AppProvider, THEME_BOOTSTRAP } from '@/lib/app/context'
import './globals.css'

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  metadataBase: new URL('https://pci.academy'),
  title: { default: 'PCI Academy', template: '%s · PCI Academy' },
  description: 'Psycho-Creative Intelligence: an observational intelligence environment. Visibility is the output; human choice begins outside the engine.',
  applicationName: 'PCI Academy',
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/favicon-32.png`, sizes: '32x32', type: 'image/png' },
      { url: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    ],
    apple: `${base}/icons/apple-touch-icon.png`,
  },
  openGraph: { title: 'PCI Academy', siteName: 'PCI Academy', images: [{ url: `${base}/brand/og.jpg`, width: 1200, height: 630, alt: 'PCI Academy' }] },
  appleWebApp: { capable: true, title: 'PCI', statusBarStyle: 'default' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0d0b' },
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
