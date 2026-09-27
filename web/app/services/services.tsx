'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Input, Label, Notice, PageHeader, Textarea } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { useOfferings } from '@/lib/app/use-offerings'
import type { ServiceOffering } from '@/lib/db/types'
import { formatDateTime } from '@/lib/utils'

function RequestForm({ service, onDone }: { service: ServiceOffering; onDone: () => void }) {
  const { repo } = useApp()
  const [preferred, setPreferred] = React.useState('')
  const [message, setMessage] = React.useState('')
  return (
    <form
      className="mt-4 space-y-3 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!repo) return
        await repo.requestService({ service_id: service.id, service_title: service.title, preferred, message })
        onDone()
      }}
    >
      <div>
        <Label htmlFor={`pref-${service.id}`}>Preferred days and times</Label>
        <Input id={`pref-${service.id}`} required value={preferred} onChange={(e) => setPreferred(e.target.value)} placeholder="e.g. weekday mornings, from 3 November" />
      </div>
      <div>
        <Label htmlFor={`msg-${service.id}`}>Message (optional)</Label>
        <Textarea id={`msg-${service.id}`} value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-20 text-[14px]" />
        <p className="mt-1 text-[12px] text-muted">Only what you write here is sent. Nothing from your journal, ledger or reports is attached.</p>
      </div>
      <Button type="submit" size="sm">
        Request
      </Button>
    </form>
  )
}

export function Services() {
  const { repo } = useApp()
  const { services } = useOfferings()
  const { data: requests } = useData((r) => r.serviceRequests(), [])
  const [open, setOpen] = React.useState<string | null>(null)

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Connect" title="Services">
        Consultation and coaching with PCI Academy. Commercial and coaching interactions never alter what the PCI Engine reports.
      </PageHeader>
      {services === null ? null : services.length ? (
        <ul className="space-y-4">
          {services.map((s) => (
            <li key={s.id} className="rounded-[4px] border border-line bg-raised p-5">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge>{s.kind}</Badge>
                <span className="text-[13px] text-muted">
                  {s.duration_minutes} minutes{s.price_note ? ` · ${s.price_note}` : ''}
                </span>
              </div>
              <h2 className="display text-[26px]">{s.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink-2">{s.description}</p>
              {open === s.id ? (
                <RequestForm service={s} onDone={() => setOpen(null)} />
              ) : (
                <Button size="sm" className="mt-4" onClick={() => setOpen(s.id)}>
                  Request a booking
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No services are currently offered">Consultation and coaching will be listed here when PCI Academy opens bookings.</Empty>
      )}

      {requests?.length ? (
        <section className="mt-12" aria-labelledby="history-h">
          <h2 id="history-h" className="display mb-3 text-[26px]">
            Your requests
          </h2>
          <ul className="divide-y divide-line border-y border-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                <span className="flex-1">
                  <span className="font-medium">{r.service_title}</span> <span className="text-muted">· {r.preferred} · {formatDateTime(r.created_at)}</span>
                </span>
                <Badge tone={r.status === 'cancelled' ? 'neutral' : 'accent'}>{r.status}</Badge>
                {r.status === 'requested' ? (
                  <Button size="sm" variant="ghost" onClick={() => repo?.cancelService(r.id)}>
                    Cancel
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Notice className="mt-10">Payment is not connected in this edition. A request records your interest; PCI Academy confirms availability and any fee directly.</Notice>
    </div>
  )
}
