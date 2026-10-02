'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader, Tabs } from '@/components/ui/primitives'
import { Journal } from './journal-tab'
import { Observe } from './observe-tab'

type Tab = 'journal' | 'observe'

// Reflection brings the daily Journal and Observe together. The data behind each is unchanged:
// journal entries and observations are stored, reported on and compared exactly as before.
export function Reflection() {
  const router = useRouter()
  const params = useSearchParams()
  const tab: Tab = params.get('tab') === 'observe' || params.get('prefill') ? 'observe' : 'journal'

  return (
    <div>
      <PageHeader eyebrow="PCI Engine" title="Reflection">
        Write to today’s subject in the journal, or submit any material to be observed. Originals are preserved unchanged; each analysis is a separate, revisable version.
      </PageHeader>
      <div className="mb-8">
        <Tabs<Tab>
          label="Reflection"
          value={tab}
          onChange={(t) => router.push(t === 'observe' ? '/reflection/?tab=observe' : '/reflection/')}
          items={[
            { value: 'journal', label: 'Journal' },
            { value: 'observe', label: 'Observe' },
          ]}
        />
      </div>
      {tab === 'observe' ? <Observe /> : <Journal />}
    </div>
  )
}
