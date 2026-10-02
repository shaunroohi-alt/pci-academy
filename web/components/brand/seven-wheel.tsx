'use client'

import * as React from 'react'
import { SEVEN_OPERATIONS } from '@/lib/pci/canon'
import { cn } from '@/lib/utils'

// The seven operations as points on one circle around the material. Every
// question is asked of the same centre; none of them is the answer.
export function SevenWheel() {
  const [active, setActive] = React.useState(0)
  const op = SEVEN_OPERATIONS[active]
  const pts = SEVEN_OPERATIONS.map((_, i) => {
    const a = -Math.PI / 2 + (i / SEVEN_OPERATIONS.length) * Math.PI * 2
    return { x: 200 + Math.cos(a) * 150, y: 200 + Math.sin(a) * 150 }
  })
  // Heptagram {7/3}: each point joined to the one three steps on.
  const star = pts.map((_, i) => pts[(i * 3) % 7]).map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,420px)_1fr]">
      <svg viewBox="0 0 400 400" className="mx-auto w-full max-w-[420px] text-brass" role="group" aria-label="The seven operations">
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <circle cx="200" cy="200" r="190" strokeWidth="2" strokeDasharray="0 9" opacity="0.7" />
          <circle cx="200" cy="200" r="150" strokeWidth="1" opacity="0.5" />
          <circle cx="200" cy="200" r="70" strokeWidth="1" opacity="0.4" />
          <path d={star} strokeWidth="1" opacity="0.45" />
          <path d={`M200 200 L${pts[active].x} ${pts[active].y}`} strokeWidth="1.6" className="text-accent" stroke="currentColor" />
        </g>
        <circle cx="200" cy="200" r="7" fill="currentColor" />
        {pts.map((p, i) => (
          <g key={i} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} className="cursor-pointer">
            <circle cx={p.x} cy={p.y} r="22" fill="var(--bg)" stroke="currentColor" strokeWidth={i === active ? 2 : 1.2} className={i === active ? 'text-accent' : undefined} />
            <text x={p.x} y={p.y + 7} textAnchor="middle" className={cn('font-display text-[21px]', i === active ? 'fill-accent' : 'fill-ink-2')}>
              {SEVEN_OPERATIONS[i].n}
            </text>
          </g>
        ))}
      </svg>
      <div>
        <div role="tablist" aria-label="Operations" className="mb-6 flex flex-wrap gap-1.5">
          {SEVEN_OPERATIONS.map((o, i) => (
            <button
              key={o.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn('cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium transition-colors', i === active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink')}
            >
              {o.n} · {o.name}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-live="polite" className="min-h-[11rem]">
          <p className="eyebrow mb-3">
            Operation {op.n} · {op.name}
          </p>
          <p className="display text-[30px] leading-[1.15] sm:text-[34px]">{op.question}</p>
          <p className="mt-4 text-[14px] text-muted">{op.principle}</p>
        </div>
      </div>
    </div>
  )
}
