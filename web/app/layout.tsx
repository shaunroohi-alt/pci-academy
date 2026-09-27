import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/app-shell'
import { ServiceWorker } from '@/components/service-worker'
import { AppProvider, THEME_BOOTSTRAP } from '@/lib/app/context'
import './globals.css'

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: { default: 'PCI Academy', template: '%s · PCI Academy' },
  description: 'Psycho-Creative Intelligence: an observational intelligence environment. Visibility is the output; human choice begins outside the engine.',
  applicationName: 'PCI Academy',
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icon.svg`, apple: `${base}/icons/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: 'PCI', statusBarStyle: 'default' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#141312' },
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
