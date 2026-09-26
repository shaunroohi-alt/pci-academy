import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/primitives'
import { GLOSSARY_TERMS, TERM_BY_SLUG } from '@/lib/content/catalog'
import { CANON_STATUS_META } from '@/lib/pci/canon'

export const metadata: Metadata = { title: 'Glossary' }

export default function Glossary() {
  const letters = [...new Set(GLOSSARY_TERMS.map((t) => t.term[0].toUpperCase()))]
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Library" title="Glossary">
        PCI terminology with canon status. Definitions follow the wording of the canon document.
      </PageHeader>
      <nav aria-label="Letters" className="mb-8 flex flex-wrap gap-2 text-[13px]">
        {letters.map((l) => (
          <a key={l} href={`#letter-${l}`} className="rounded-[2px] border border-line px-2 py-0.5 hover:bg-surface">
            {l}
          </a>
        ))}
      </nav>
      <dl>
        {GLOSSARY_TERMS.map((t, i) => {
          const letter = t.term[0].toUpperCase()
          const first = i === 0 || GLOSSARY_TERMS[i - 1].term[0].toUpperCase() !== letter
          return (
            <div key={t.slug} id={t.slug} className="scroll-mt-24 border-t border-line py-5">
              {first ? <span id={`letter-${letter}`} className="block scroll-mt-24" /> : null}
              <dt className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="display text-[24px]">{t.term}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {CANON_STATUS_META[t.canon_status].label}
                  {t.source ? ` · ${t.source}` : ''}
                </span>
              </dt>
              <dd className="mt-1.5 font-serif text-[16.5px] leading-relaxed text-ink-2">{t.definition}</dd>
              {t.see.length ? (
                <dd className="mt-2 text-[13px] text-muted">
                  See also:{' '}
                  {t.see.map((s, k) => (
                    <span key={s}>
                      {k ? ', ' : ''}
                      <Link href={`#${s}`} className="text-accent">
                        {TERM_BY_SLUG.get(s)?.term ?? s}
                      </Link>
                    </span>
                  ))}
                </dd>
              ) : null}
            </div>
          )
        })}
      </dl>
    </div>
  )
}
