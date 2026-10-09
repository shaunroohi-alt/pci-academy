'use client'

import { Check, Download, Infinity as InfinityIcon, KeyRound, Layers, Music2, SlidersHorizontal } from 'lucide-react'
import * as React from 'react'
import { BUNDLE_MONTHLY, PLANS, PLUGINS, type PluginKind, usd } from '@/lib/mp-audio/catalog'
import { PreviewGate } from '@/components/preview-gate'
import { cn } from '@/lib/utils'
import { PluginArt } from './brand'

const FILTERS: { id: 'all' | PluginKind; label: string }[] = [
  { id: 'all', label: 'All plugins' },
  { id: 'instrument', label: 'Virtual instruments' },
  { id: 'mixing', label: 'Mixing & mastering' },
]

const KIND_LABEL: Record<PluginKind, string> = { instrument: 'Instrument', mixing: 'Mixing' }

function Section({ id, eyebrow, title, intro, children, className }: { id: string; eyebrow: string; title: string; intro?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn('mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6', className)}>
      <p className="mpa-eyebrow">{eyebrow}</p>
      <h2 id={`${id}-h`} className="mt-3 text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
        {title}
      </h2>
      {intro ? <p className="mt-3 max-w-2xl text-[16px] text-[var(--mpa-ink-2)]">{intro}</p> : null}
      <div className="mt-10">{children}</div>
    </section>
  )
}

function Meter() {
  return (
    <div className="mpa-meter flex h-16 items-end gap-1" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="block w-1.5 rounded-sm"
          style={{
            height: `${30 + ((i * 37) % 70)}%`,
            background: i > 13 ? 'var(--mpa-accent)' : i > 9 ? '#ffb347' : 'var(--mpa-accent-2)',
            animationDelay: `${(i * 97) % 900}ms`,
          }}
        />
      ))}
    </div>
  )
}

function Hero() {
  const instruments = PLUGINS.filter((p) => p.kind === 'instrument').length
  return (
    <div className="relative">
      <div className="mpa-grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <Meter />
          <h1 className="mt-6 text-[44px] font-extrabold leading-[1.02] tracking-tight sm:text-[64px]">
            Instruments that play.
            <br />
            <span className="text-[var(--mpa-accent)]">Mixers that finish.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] text-[var(--mpa-ink-2)]">
            Virtual instrument and mixing plugins from MP Audio. Subscribe to one plugin, rent it until it&rsquo;s yours, or get every plugin in a single monthly bundle.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#plugins" className="mpa-btn mpa-btn-primary h-11 px-5 text-[14px]">
              Browse plugins
            </a>
            <a href="#pricing" className="mpa-btn mpa-btn-ghost h-11 px-5 text-[14px]">
              Compare plans
            </a>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-[var(--mpa-line)] pt-6">
            <div>
              <dt className="text-[12px] text-[var(--mpa-muted)]">Instruments</dt>
              <dd className="text-[24px] font-bold">{instruments}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--mpa-muted)]">Mixing tools</dt>
              <dd className="text-[24px] font-bold">{PLUGINS.length - instruments}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--mpa-muted)]">Formats</dt>
              <dd className="text-[24px] font-bold">3</dd>
            </div>
          </dl>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(closest-side,var(--mpa-accent-soft),transparent)]" aria-hidden />
          <div className="relative grid grid-cols-2 gap-3">
            {PLUGINS.slice(0, 4).map((p, i) => (
              <div key={p.slug} className={cn('overflow-hidden rounded-xl border border-[var(--mpa-line-strong)] shadow-2xl shadow-black/50', i % 2 ? 'translate-y-6' : '')}>
                <PluginArt plugin={p} className="block h-auto w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Catalog() {
  const [filter, setFilter] = React.useState<'all' | PluginKind>('all')
  const shown = filter === 'all' ? PLUGINS : PLUGINS.filter((p) => p.kind === filter)
  return (
    <Section id="plugins" eyebrow="Catalogue" title="The plugins" intro="Every plugin runs as VST3, AU and AAX on macOS and Windows. Subscribe to it on its own, rent it to own, or get it in the bundle.">
      <div role="group" aria-label="Filter plugins" className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'cursor-pointer rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors',
              filter === f.id ? 'border-[var(--mpa-accent)] bg-[var(--mpa-accent-soft)] text-[var(--mpa-ink)]' : 'border-[var(--mpa-line-strong)] text-[var(--mpa-muted)] hover:text-[var(--mpa-ink)]',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((p) => (
          <li key={p.slug} id={p.slug} className="flex scroll-mt-24 flex-col overflow-hidden rounded-xl border border-[var(--mpa-line)] bg-[var(--mpa-panel)]">
            <PluginArt plugin={p} className="block h-auto w-full" />
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                <span className={p.kind === 'instrument' ? 'text-[var(--mpa-accent)]' : 'text-[var(--mpa-accent-2)]'}>{KIND_LABEL[p.kind]}</span>
                <span className="text-[var(--mpa-muted)]">· {p.category}</span>
              </div>
              <h3 className="mt-2 text-[20px] font-bold">{p.name}</h3>
              <p className="mt-1 text-[14px] text-[var(--mpa-ink-2)]">{p.tagline}</p>
              <ul className="mt-4 space-y-1.5 text-[13px] text-[var(--mpa-ink-2)]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mpa-accent)]" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--mpa-line)] pt-4 text-[12px]">
                <div>
                  <dt className="text-[var(--mpa-muted)]">Subscribe</dt>
                  <dd className="text-[16px] font-bold">
                    {usd(p.monthly)}
                    <span className="text-[12px] font-normal text-[var(--mpa-muted)]">/mo</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--mpa-muted)]">Rent-to-own</dt>
                  <dd className="text-[16px] font-bold">
                    {usd(p.rent.monthly)}
                    <span className="text-[12px] font-normal text-[var(--mpa-muted)]"> ×{p.rent.payments}</span>
                  </dd>
                </div>
              </dl>
              {p.placeholder ? <p className="mt-3 text-[11px] text-[var(--mpa-muted)]">Placeholder product and pricing</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const PLAN_ICON = { single: Music2, bundle: Layers, rent: KeyRound }

function Pricing() {
  const separately = PLUGINS.reduce((s, p) => s + p.monthly, 0)
  return (
    <Section id="pricing" eyebrow="Pricing" title="Three ways to get MP Audio" intro="Start with one plugin and grow into the bundle, or rent the ones you know you'll keep.">
      <ul className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = PLAN_ICON[plan.id]
          return (
            <li
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl border p-7',
                plan.featured ? 'border-[var(--mpa-accent)] bg-[linear-gradient(180deg,rgba(255,122,26,0.12),var(--mpa-panel)_45%)] lg:-my-3 lg:py-10' : 'border-[var(--mpa-line)] bg-[var(--mpa-panel)]',
              )}
            >
              {plan.featured ? <span className="absolute -top-3 left-7 rounded-full bg-[var(--mpa-accent)] px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-black">Best value</span> : null}
              <Icon className="h-6 w-6 text-[var(--mpa-accent)]" aria-hidden />
              <h3 className="mt-4 text-[20px] font-bold">{plan.name}</h3>
              <p className="mt-1 text-[14px] text-[var(--mpa-ink-2)]">{plan.summary}</p>
              <p className="mt-6">
                <span className="text-[36px] font-extrabold tracking-tight">{plan.price}</span>
                <span className="ml-1.5 text-[13px] text-[var(--mpa-muted)]">{plan.cadence}</span>
              </p>
              {plan.id === 'bundle' ? (
                <p className="mt-1 text-[13px] text-[var(--mpa-accent-2)]">
                  {usd(separately)}/mo if subscribed one by one. Save {usd(separately - BUNDLE_MONTHLY)} a month.
                </p>
              ) : null}
              <ul className="mt-6 space-y-2.5 text-[14px]">
                {plan.points.map((pt) => (
                  <li key={pt} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mpa-accent)]" aria-hidden />
                    {pt}
                  </li>
                ))}
              </ul>
              <a href="#waitlist" className={cn('mpa-btn mt-8 h-11 px-5 text-[14px]', plan.featured ? 'mpa-btn-primary' : 'mpa-btn-ghost')}>
                Coming soon
              </a>
            </li>
          )
        })}
      </ul>
      <p className="mt-6 text-[12px] text-[var(--mpa-muted)]">Prices shown are placeholders in USD and will change before launch.</p>
    </Section>
  )
}

function RentToOwn() {
  const [slug, setSlug] = React.useState(PLUGINS[0].slug)
  const [paid, setPaid] = React.useState(4)
  const p = PLUGINS.find((x) => x.slug === slug) ?? PLUGINS[0]
  const n = Math.min(paid, p.rent.payments)
  const total = p.rent.monthly * p.rent.payments
  const pct = (n / p.rent.payments) * 100
  return (
    <Section id="rent-to-own" eyebrow="Rent-to-own" title="Every payment counts toward owning it" intro="Rent a plugin month by month. After the last payment the licence is yours for good, with no subscription left to cancel.">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <ol className="space-y-5">
          {[
            { icon: Download, title: 'Start renting', body: 'Pick a plugin and install it straight away. The first payment unlocks the full version.' },
            { icon: SlidersHorizontal, title: 'Pay monthly, pause any time', body: 'Skip a month and your progress waits for you. Nothing you have paid is lost.' },
            { icon: InfinityIcon, title: 'Own it outright', body: 'After the final payment the licence is permanent. Keep using it without any subscription.' },
          ].map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--mpa-line-strong)] bg-[var(--mpa-panel-2)] text-[var(--mpa-accent)]">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-[var(--mpa-muted)]">Step {i + 1}</p>
                <h3 className="text-[17px] font-bold">{s.title}</h3>
                <p className="mt-1 text-[14px] text-[var(--mpa-ink-2)]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-2xl border border-[var(--mpa-line)] bg-[var(--mpa-panel)] p-6">
          <p className="text-[13px] font-semibold">Try it</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-[12px] text-[var(--mpa-muted)]">
              Plugin
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-[var(--mpa-line-strong)] bg-[var(--mpa-panel-2)] px-3 text-[14px] text-[var(--mpa-ink)]"
              >
                {PLUGINS.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-[var(--mpa-muted)]">
              Payments made: <span className="font-semibold text-[var(--mpa-ink)]">{n}</span>
              <input type="range" min={0} max={p.rent.payments} value={n} onChange={(e) => setPaid(Number(e.target.value))} className="mt-3 block w-full accent-[var(--mpa-accent)]" />
            </label>
          </div>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--mpa-panel-2)]" role="progressbar" aria-valuemin={0} aria-valuemax={p.rent.payments} aria-valuenow={n} aria-label="Progress to ownership">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--mpa-accent-2),var(--mpa-accent))] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-4 text-[12px]">
            <div>
              <dt className="text-[var(--mpa-muted)]">Monthly</dt>
              <dd className="text-[18px] font-bold">{usd(p.rent.monthly)}</dd>
            </div>
            <div>
              <dt className="text-[var(--mpa-muted)]">Paid so far</dt>
              <dd className="text-[18px] font-bold">{usd(n * p.rent.monthly)}</dd>
            </div>
            <div>
              <dt className="text-[var(--mpa-muted)]">Owned at</dt>
              <dd className="text-[18px] font-bold">{usd(total)}</dd>
            </div>
          </dl>
          <p className="mt-5 text-[14px] text-[var(--mpa-ink-2)]">
            {n >= p.rent.payments ? (
              <>
                <span className="font-semibold text-[var(--mpa-accent)]">{p.name} is yours.</span> No more payments.
              </>
            ) : (
              <>
                {p.rent.payments - n} payment{p.rent.payments - n === 1 ? '' : 's'} left until you own {p.name}.
              </>
            )}
          </p>
        </div>
      </div>
    </Section>
  )
}

const FAQ = [
  { q: 'Which DAWs and systems are supported?', a: 'Every plugin ships as VST3 and AU on macOS, and VST3 and AAX on Windows, so it runs in Ableton Live, Logic Pro, Pro Tools, FL Studio, Cubase, Studio One, Reaper and other hosts that load those formats.' },
  { q: 'Can I switch from a single-plugin subscription to the bundle?', a: 'Yes. Upgrade at any time and the bundle starts on your next billing date.' },
  { q: 'What happens to rent-to-own if I stop paying?', a: 'The plugin stops working until you resume, and your payments so far still count toward owning it.' },
  { q: 'Do I need to be online to use the plugins?', a: 'Only to activate and to renew a subscription licence. Owned plugins work offline.' },
]

function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions">
      <div className="divide-y divide-[var(--mpa-line)] rounded-2xl border border-[var(--mpa-line)] bg-[var(--mpa-panel)]">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold">
              {f.q}
              <span className="text-[20px] leading-none text-[var(--mpa-accent)] transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-3 text-[14px] text-[var(--mpa-ink-2)]">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

function Waitlist() {
  return (
    <section id="waitlist" aria-labelledby="waitlist-h" className="scroll-mt-20 border-t border-[var(--mpa-line)] bg-[radial-gradient(ellipse_at_top,rgba(255,122,26,0.14),transparent_60%)]">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="mpa-eyebrow">Launching soon</p>
        <h2 id="waitlist-h" className="mt-3 text-[32px] font-extrabold tracking-tight sm:text-[40px]">
          The store opens soon
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[16px] text-[var(--mpa-ink-2)]">
          Checkout isn&rsquo;t open yet. Subscriptions, rent-to-own and the all-access bundle go live here at launch.
        </p>
        <span className="mpa-btn mpa-btn-ghost mt-8 h-11 cursor-default px-6 text-[14px] opacity-80" aria-disabled="true">
          Checkout coming soon
        </span>
      </div>
    </section>
  )
}

function ComingSoon() {
  return (
    <div className="relative">
      <div className="mpa-grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 pb-24 pt-20 text-center sm:px-6 lg:pt-28">
        <div className="flex justify-center">
          <Meter />
        </div>
        <p className="mpa-eyebrow mt-8">Launching soon</p>
        <h1 className="mt-3 text-[44px] font-extrabold leading-[1.02] tracking-tight sm:text-[64px]">
          Instruments that play.
          <br />
          <span className="text-[var(--mpa-accent)]">Mixers that finish.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[17px] text-[var(--mpa-ink-2)]">
          Virtual instrument and mixing plugins from MP Audio. The catalogue and plans open here at launch: subscribe to one plugin, rent it until it&rsquo;s yours, or get every plugin in a single monthly bundle.
        </p>
      </div>
    </div>
  )
}

/** The catalogue and prices are placeholders, so visitors see the coming-soon hero; the full store shows in owner preview. */
export function Storefront() {
  return (
    <PreviewGate badge fallback={<ComingSoon />}>
      <div className="border-b border-[var(--mpa-line)] bg-[var(--mpa-accent-soft)] px-4 py-2 text-center text-[12px] text-[var(--mpa-ink-2)]">
        Store preview: the plugins and prices shown are placeholders.
      </div>
      <Hero />
      <Catalog />
      <Pricing />
      <RentToOwn />
      <Faq />
      <Waitlist />
    </PreviewGate>
  )
}
