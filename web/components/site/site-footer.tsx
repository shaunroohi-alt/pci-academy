import { SITE } from '@/content/site'

/** Footer lockup, on every page. Three lines, exactly. */
export function SiteFooter() {
  return (
    <footer className="no-print mt-20 border-t border-line">
      <div className="mx-auto max-w-[720px] px-5 py-10 sm:px-6">
        <p className="font-display text-[19px] text-ink">
          {SITE.name} · {SITE.book}
        </p>
        <p className="label mt-2 text-[13px] text-muted">{SITE.disclaimer}</p>
        <p className="mt-4 font-display text-[17px] italic text-ink-2">{SITE.close}</p>
      </div>
    </footer>
  )
}
