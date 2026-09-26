'use client'

import * as React from 'react'
import { useCms } from '@/lib/app/use-cms'
import type { CommunityEvent, ServiceOffering } from '@/lib/db/types'

/** Published gatherings and services from the CMS (local workspace or Supabase). */
export function useOfferings() {
  const { cms } = useCms()
  const [events, setEvents] = React.useState<CommunityEvent[] | null>(null)
  const [services, setServices] = React.useState<ServiceOffering[] | null>(null)
  React.useEffect(() => {
    if (!cms) return
    cms
      .events()
      .then((e) => {
        const since = new Date(Date.now() - 86400000).toISOString()
        setEvents(e.filter((x) => x.status === 'published' && x.starts_at >= since).sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
      })
      .catch(() => setEvents([]))
    cms.services().then((s) => setServices(s.filter((x) => x.status === 'published'))).catch(() => setServices([]))
  }, [cms])
  return { events, services }
}
