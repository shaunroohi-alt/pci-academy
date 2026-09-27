'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge, PageHeader } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { BALANCE_NOTE, CONTRARY_STEPS } from '@/lib/pci/canon'
import { formatDateTime } from '@/lib/utils'

export function ContraryIndex() {
  const { repo } = useApp()
  const router = useRouter()
  const { data: sessions } = useData((r) => r.contrarySessions(), [])

  const start = async () => {
    if (!repo) return
    const s = await repo.saveContrary({ title: '' })
    router.push(`/contrary/session/?id=${s.id}`)
  }

  return (
    <div>
      <PageHeader eyebrow="Examine" title="On the Contrary" actions={<Button onClick={start}>Begin a session</Button>}>
        A contained examination of an apparent error, imbalance, problem, unwanted event or contradiction — within the wider relational system it belongs to.
      </PageHeader>

      <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-[19px]">
        {CONTRARY_STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3">
            <span>{s.name}</span>
            {i < CONTRARY_STEPS.length - 1 ? <span className="text-brass" aria-hidden>→</span> : null}
          </li>
        ))}
      </ol>
      <p className="mb-12 max-w-2xl border-l-2 border-brass pl-4 text-[14px] text-ink-2">{BALANCE_NOTE}</p>

      <h2 className="display mb-4 text-[28px]">Sessions</h2>
      {sessions?.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/contrary/session/?id=${s.id}`} className="flex flex-col gap-1 py-3 hover:bg-surface sm:flex-row sm:items-center sm:gap-4 sm:px-2">
                <span className="flex-1 font-serif text-[17px]">{s.title || s.steps.identified_error?.slice(0, 80) || 'Untitled session'}</span>
                <span className="flex items-center gap-2 text-[12px] text-muted">
                  {s.status === 'complete' ? <Badge tone="solid">Complete</Badge> : <Badge>Step {s.current_step + 1} of 6</Badge>}
                  Updated {formatDateTime(s.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">No sessions yet. A session saves as you go and can be resumed at any step.</p>
      )}
    </div>
  )
}
