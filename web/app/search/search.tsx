'use client'

import { Lock } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Badge, Input, PageHeader, Tabs } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { GLOSSARY_TERMS, published, PUBLISHED_COURSES } from '@/lib/content/catalog'
import { privateDocs, publicDocs, search, type Scope } from '@/lib/search'

export function SearchPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [q, setQ] = React.useState(params.get('q') ?? '')
  const [scope, setScope] = React.useState<'all' | Scope>('all')
  const { content } = useApp()
  const { data: mine } = useData(async (r) => privateDocs({ journal: await r.journalEntries(), ledger: await r.ledger(), observations: await r.observations(), contrary: await r.contrarySessions() }), [])
  const pub = React.useMemo(() => publicDocs(published(content), GLOSSARY_TERMS, PUBLISHED_COURSES), [content])

  React.useEffect(() => {
    const t = setTimeout(() => router.replace(q ? `/search/?q=${encodeURIComponent(q)}` : '/search/'), 300)
    return () => clearTimeout(t)
  }, [q, router])

  const hits = React.useMemo(() => search([...pub, ...(mine ?? [])], q), [pub, mine, q])
  const shown = hits.filter((h) => scope === 'all' || h.scope === scope)
  const count = (s: Scope) => hits.filter((h) => h.scope === s).length

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Search" title="Search">
        PCI content and your own material. Private results are marked, and come only from your own records.
      </PageHeader>
      <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a word or phrase" aria-label="Search" className="h-12 text-[16px]" />
      {q.trim() ? (
        <>
          <div className="mt-6">
            <Tabs
              label="Scope"
              value={scope}
              onChange={setScope}
              items={[
                { value: 'all', label: 'All', count: hits.length },
                { value: 'public', label: 'PCI content', count: count('public') },
                { value: 'private', label: 'Your material', count: count('private') },
              ]}
            />
          </div>
          {shown.length ? (
            <ul className="mt-4 divide-y divide-line">
              {shown.map((h) => (
                <li key={h.id}>
                  <Link href={h.href} className="block py-4 hover:bg-surface sm:px-2">
                    <span className="mb-1 flex items-center gap-2">
                      {h.scope === 'private' ? (
                        <Badge tone="accent">
                          <Lock className="h-3 w-3" aria-hidden /> Private · {h.kind}
                        </Badge>
                      ) : (
                        <Badge>PCI content · {h.kind}</Badge>
                      )}
                    </span>
                    <span className="block font-serif text-[18px]">{h.title}</span>
                    <span className="mt-1 block text-[13.5px] text-ink-2">{h.snippet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-[14px] text-muted">No results for “{q}”.</p>
          )}
          <p className="mt-8 text-[12px] text-muted">Keyword search. Semantic search is introduced only once private-index deletion and scope controls are in place.</p>
        </>
      ) : null}
    </div>
  )
}
