'use client'

import Link from 'next/link'
import * as React from 'react'
import { Button, LinkButton } from '@/components/ui/button'
import { Badge, Empty, Input, Label, Notice, PageHeader, Select, Tabs, Textarea } from '@/components/ui/primitives'
import { useApp } from '@/lib/app/context'
import { useCms } from '@/lib/app/use-cms'
import { GLOSSARY_TERMS } from '@/lib/content/catalog'
import { LIFECYCLE_LABELS } from '@/lib/content/lifecycle'
import { validateForPublication } from '@/lib/content/validation'
import type { CommunityEvent, ServiceOffering } from '@/lib/db/types'
import { CANON_STATUS_META } from '@/lib/pci/canon'
import { formatDateTime } from '@/lib/utils'

type Tab = 'content' | 'glossary' | 'events' | 'services'

export function Admin() {
  const { content, mode } = useApp()
  const { cms, allowed } = useCms()
  const [tab, setTab] = React.useState<Tab>('content')
  const [events, setEvents] = React.useState<CommunityEvent[]>([])
  const [services, setServices] = React.useState<ServiceOffering[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const [nonce, setNonce] = React.useState(0)
  const load = React.useCallback(() => setNonce((n) => n + 1), [])
  React.useEffect(() => {
    if (!cms) return
    let live = true
    Promise.all([cms.events(), cms.services()])
      .then(([e, s]) => {
        if (!live) return
        setEvents(e)
        setServices(s)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [cms, nonce])

  if (allowed === false) {
    return <Empty title="Staff access required">The PCI Academy CMS is available to editors and administrators.</Empty>
  }

  const sorted = [...content].sort((a, b) => a.collection.localeCompare(b.collection) || (a.order ?? 99) - (b.order ?? 99))

  return (
    <div>
      <PageHeader eyebrow="PCI Academy" title="Content management" actions={<LinkButton href="/admin/edit/?new=1" size="sm">New article</LinkButton>}>
        Draft → Review → Approved → Published → Revised → Superseded. A text cannot be published until it is complete; revisions keep every earlier version.
      </PageHeader>

      {mode === 'local' ? (
        <Notice tone="accent" className="mb-6" title="Local workspace">
          No backend is configured, so changes made here apply in this browser only. Use it to prepare and preview texts; connect Supabase to publish them for every reader.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger" className="mb-6">{error}</Notice> : null}

      <Tabs<Tab>
        label="Sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'content', label: 'Texts', count: content.length },
          { value: 'glossary', label: 'Glossary', count: GLOSSARY_TERMS.length },
          { value: 'events', label: 'Gatherings', count: events.length },
          { value: 'services', label: 'Services', count: services.length },
        ]}
      />

      <div className="mt-6">
        {tab === 'content' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Text</th>
                  <th className="py-2 pr-3 font-semibold">Collection</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Canon</th>
                  <th className="py-2 pr-3 font-semibold">Version</th>
                  <th className="py-2 pr-3 font-semibold">Publication check</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const check = validateForPublication(c)
                  return (
                    <tr key={c.slug} className="border-b border-line hover:bg-surface">
                      <td className="py-2 pr-3">
                        <Link href={`/admin/edit/?slug=${c.slug}`} className="font-medium hover:text-accent">
                          {c.order !== undefined && c.collection === 'art-of-being' && c.type === 'chapter' ? `${c.order}. ` : ''}
                          {c.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-muted">{c.collection}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={c.status === 'published' ? 'solid' : 'neutral'}>{LIFECYCLE_LABELS[c.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-muted">{CANON_STATUS_META[c.canon_status].label}</td>
                      <td className="py-2 pr-3 text-muted">v{c.content_version}</td>
                      <td className="py-2 pr-3">{check.ok ? <span className="text-muted">Complete</span> : <span className="text-danger">{check.errors[0]}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : tab === 'glossary' ? (
          <ul className="divide-y divide-line">
            {GLOSSARY_TERMS.map((t) => (
              <li key={t.slug} className="grid gap-1 py-2 text-[13.5px] sm:grid-cols-[220px_minmax(0,1fr)_110px]">
                <span className="font-medium">{t.term}</span>
                <span className="text-ink-2">{t.definition}</span>
                <span className="text-muted">{CANON_STATUS_META[t.canon_status].label}</span>
              </li>
            ))}
          </ul>
        ) : tab === 'events' ? (
          <EventsEditor events={events} onChange={load} />
        ) : (
          <ServicesEditor services={services} onChange={load} />
        )}
      </div>
    </div>
  )
}

function EventsEditor({ events, onChange }: { events: CommunityEvent[]; onChange: () => void }) {
  const { cms } = useCms()
  const blank: CommunityEvent = { id: '', title: '', kind: 'gathering', starts_at: '', location: '', description: '', capacity: null, status: 'draft' }
  const [e, setE] = React.useState<CommunityEvent>(blank)
  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!cms) return
    await cms.saveEvent({ ...e, id: e.id || crypto.randomUUID(), starts_at: new Date(e.starts_at).toISOString() })
    setE(blank)
    onChange()
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        {events.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {events.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                <span className="flex-1">
                  <span className="font-medium">{x.title}</span> <span className="text-muted">· {formatDateTime(x.starts_at)} · {x.location}</span>
                </span>
                <Badge tone={x.status === 'published' ? 'solid' : 'neutral'}>{x.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setE({ ...x, starts_at: x.starts_at.slice(0, 16) })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await cms?.deleteEvent(x.id); onChange() }}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">No gatherings yet.</p>
        )}
      </div>
      <form onSubmit={save} className="space-y-3 rounded-[4px] border border-line p-5" aria-label="Gathering">
        <p className="eyebrow">{e.id ? 'Edit gathering' : 'New gathering'}</p>
        <div><Label htmlFor="ev-title">Title</Label><Input id="ev-title" required value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></div>
        <div><Label htmlFor="ev-kind">Kind</Label><Select id="ev-kind" value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as CommunityEvent['kind'] })}><option value="gathering">Gathering</option><option value="seminar">Seminar</option><option value="discussion">Moderated discussion</option></Select></div>
        <div><Label htmlFor="ev-when">Starts</Label><Input id="ev-when" type="datetime-local" required value={e.starts_at} onChange={(x) => setE({ ...e, starts_at: x.target.value })} /></div>
        <div><Label htmlFor="ev-where">Location</Label><Input id="ev-where" required value={e.location} onChange={(x) => setE({ ...e, location: x.target.value })} /></div>
        <div><Label htmlFor="ev-cap">Capacity (optional)</Label><Input id="ev-cap" type="number" min={1} value={e.capacity ?? ''} onChange={(x) => setE({ ...e, capacity: x.target.value ? Number(x.target.value) : null })} /></div>
        <div><Label htmlFor="ev-desc">Description</Label><Textarea id="ev-desc" required value={e.description} onChange={(x) => setE({ ...e, description: x.target.value })} className="min-h-24 text-[14px]" /></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={e.status === 'published'} onChange={(x) => setE({ ...e, status: x.target.checked ? 'published' : 'draft' })} /> Published</label>
        <Button type="submit">Save</Button>
      </form>
    </div>
  )
}

function ServicesEditor({ services, onChange }: { services: ServiceOffering[]; onChange: () => void }) {
  const { cms } = useCms()
  const blank: ServiceOffering = { id: '', title: '', kind: 'consultation', description: '', duration_minutes: 60, price_note: '', status: 'draft' }
  const [s, setS] = React.useState<ServiceOffering>(blank)
  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!cms) return
    await cms.saveService({ ...s, id: s.id || crypto.randomUUID() })
    setS(blank)
    onChange()
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <Notice className="mb-4">Commercial and coaching interactions never alter PCI Engine output. Payment is not connected in this edition; requests are recorded for follow-up.</Notice>
        {services.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {services.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                <span className="flex-1">
                  <span className="font-medium">{x.title}</span> <span className="text-muted">· {x.kind} · {x.duration_minutes} min</span>
                </span>
                <Badge tone={x.status === 'published' ? 'solid' : 'neutral'}>{x.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setS(x)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await cms?.deleteService(x.id); onChange() }}>Delete</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">No services yet.</p>
        )}
      </div>
      <form onSubmit={save} className="space-y-3 rounded-[4px] border border-line p-5" aria-label="Service">
        <p className="eyebrow">{s.id ? 'Edit service' : 'New service'}</p>
        <div><Label htmlFor="sv-title">Title</Label><Input id="sv-title" required value={s.title} onChange={(x) => setS({ ...s, title: x.target.value })} /></div>
        <div><Label htmlFor="sv-kind">Kind</Label><Select id="sv-kind" value={s.kind} onChange={(x) => setS({ ...s, kind: x.target.value as ServiceOffering['kind'] })}><option value="consultation">Consultation</option><option value="coaching">Coaching</option><option value="workshop">Workshop</option></Select></div>
        <div><Label htmlFor="sv-dur">Duration (minutes)</Label><Input id="sv-dur" type="number" min={15} value={s.duration_minutes} onChange={(x) => setS({ ...s, duration_minutes: Number(x.target.value) })} /></div>
        <div><Label htmlFor="sv-price">Price note</Label><Input id="sv-price" value={s.price_note} onChange={(x) => setS({ ...s, price_note: x.target.value })} placeholder="e.g. Fee confirmed on booking" /></div>
        <div><Label htmlFor="sv-desc">Description</Label><Textarea id="sv-desc" required value={s.description} onChange={(x) => setS({ ...s, description: x.target.value })} className="min-h-24 text-[14px]" /></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={s.status === 'published'} onChange={(x) => setS({ ...s, status: x.target.checked ? 'published' : 'draft' })} /> Published</label>
        <Button type="submit">Save</Button>
      </form>
    </div>
  )
}
