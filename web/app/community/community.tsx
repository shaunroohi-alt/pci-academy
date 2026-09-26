'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Notice, PageHeader } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { useOfferings } from '@/lib/app/use-offerings'
import { formatDateTime } from '@/lib/utils'

const KIND: Record<string, string> = { gathering: 'Gathering', seminar: 'Seminar', discussion: 'Moderated discussion' }

export function Community() {
  const { repo } = useApp()
  const { events } = useOfferings()
  const { data: regs } = useData((r) => r.registrations(), [])
  const upcoming = events ?? []

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Connect" title="Community">
        Gatherings, seminars and moderated discussions. Your private PCI material stays private here: nothing from your journal, ledger or reports is shared unless you share it yourself.
      </PageHeader>
      {events === null ? null : upcoming.length ? (
        <ul className="space-y-4">
          {upcoming.map((e) => {
            const registered = regs?.some((r) => r.event_id === e.id)
            return (
              <li key={e.id} className="rounded-[4px] border border-line bg-raised p-5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge>{KIND[e.kind]}</Badge>
                  <span className="text-[13px] text-muted">
                    {formatDateTime(e.starts_at)} · {e.location}
                    {e.capacity ? ` · ${e.capacity} places` : ''}
                  </span>
                </div>
                <h2 className="display text-[26px]">{e.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink-2">{e.description}</p>
                <div className="mt-4">
                  {registered ? (
                    <Button variant="outline" size="sm" onClick={() => repo?.unregister(e.id)}>
                      Registered — cancel registration
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => repo?.register(e.id, e.title)}>
                      Register
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty title="No gatherings are scheduled">When PCI Academy announces a gathering or seminar it will appear here.</Empty>
      )}
      <Notice className="mt-10">Registrations are recorded with your material. Confirmation and reminders are sent by PCI Academy when a backend is connected.</Notice>
    </div>
  )
}
