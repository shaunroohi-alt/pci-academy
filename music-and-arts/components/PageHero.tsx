import type { ReactNode } from 'react'

export function PageHero({ eyebrow, title, lead, actions, tone = 'ink' }: { eyebrow: string; title: string; lead: string; actions?: ReactNode; tone?: 'ink' | 'plum' }) {
  const bg = tone === 'plum' ? 'bg-plum' : 'bg-ink'
  return (
    <section className={`${bg} text-white`}>
      <div className="container-x py-16 sm:py-20">
        <p className="eyebrow text-gold">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-white/80">{lead}</p>
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  )
}
