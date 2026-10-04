import type { Metadata } from 'next'
import { MpShell } from '@/components/mp-audio/shell'

export const metadata: Metadata = {
  title: { default: 'MP Audio · Virtual instruments and mixing plugins', template: '%s · MP Audio' },
  description: 'MP Audio virtual instrument and mixing plugins. Subscribe per plugin, rent to own, or get every plugin in one monthly bundle.',
  applicationName: 'MP Audio',
  openGraph: { title: 'MP Audio', siteName: 'MP Audio', description: 'Virtual instruments and mixing plugins by subscription or rent-to-own.' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MpShell>{children}</MpShell>
}
