import { Play } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { Diamond } from '@/components/brand/glyphs'
import { MEDIA_KIND_META, type MediaItem } from '@/lib/media/catalog'
import { cn } from '@/lib/utils'

function seed(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Geometric poster drawn from the mark. Each kind of material has its own figure. */
export function MediaPoster({ item, className }: { item: MediaItem; className?: string }) {
  const h = seed(item.slug)
  const turn = (h % 6) * 15
  const gold = '#c9a04a'
  let figure: React.ReactNode
  switch (item.kind) {
    case 'seminar': {
      // People gathered around one subject: a ring of points around a centre.
      const n = 9 + (h % 5)
      figure = (
        <g>
          <circle cx="0" cy="0" r="62" />
          <circle cx="0" cy="0" r="104" strokeDasharray="0 9" strokeWidth="2.4" />
          {Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2
            return <circle key={i} cx={Math.cos(a) * 84} cy={Math.sin(a) * 84} r="4" fill={gold} stroke="none" />
          })}
          <circle cx="0" cy="0" r="7" fill={gold} stroke="none" />
        </g>
      )
      break
    }
    case 'course': {
      // A sequence: steps along one axis, rising to the capped staff.
      figure = (
        <g>
          <path d="M-150 0 H150" opacity="0.6" />
          {[-120, -72, -24, 24, 72].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy="0" r={6 + i * 2} />
              <circle cx={x} cy="0" r="2.5" fill={gold} stroke="none" />
            </g>
          ))}
          <path d="M120 -64 L110 -46 H130 Z M104 -44 H136 V-38 H104 Z M116 -38 V38 M124 -38 V38 M104 38 H136 V44 H104 Z" />
        </g>
      )
      break
    }
    case 'lecture':
      // One subject held in view: triangle within circle, centre point.
      figure = (
        <g transform={`rotate(${turn})`}>
          <circle cx="0" cy="0" r="96" />
          <circle cx="0" cy="0" r="70" opacity="0.6" />
          <path d="M0 -84 L73 42 H-73 Z" />
          <path d="M0 -110 V110" opacity="0.5" />
          <circle cx="0" cy="0" r="6" fill={gold} stroke="none" />
        </g>
      )
      break
    default:
      // Visual essay: two contexts overlapping, the diamond of what becomes visible.
      figure = (
        <g>
          <circle cx="-38" cy="0" r="74" />
          <circle cx="38" cy="0" r="74" />
          <path d="M0 -50 L30 0 L0 50 L-30 0 Z" />
          <circle cx="0" cy="0" r="4" fill={gold} stroke="none" />
          <circle cx="0" cy="0" r="118" strokeDasharray="0 9" strokeWidth="2.4" />
        </g>
      )
  }
  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-[3px] bg-[#0e0d0b]', className)}>
      {item.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.poster} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="-240 -135 480 270" className="h-full w-full" fill="none" stroke={gold} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <g opacity="0.18">
            <circle cx="0" cy="0" r="180" />
            <path d="M-240 0 H240" />
          </g>
          {figure}
        </svg>
      )}
      {item.status === 'available' ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full border border-[#c9a04a] bg-[#0e0d0b]/70 text-[#e8c26f] transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-5 w-5" aria-hidden />
          </span>
        </span>
      ) : (
        <span className="absolute right-3 top-3 rounded-[2px] border border-[#c9a04a]/60 bg-[#0e0d0b]/80 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e8c26f]">Forthcoming</span>
      )}
    </div>
  )
}

export function MediaCard({ item }: { item: MediaItem }) {
  return (
    <Link href={`/media/${item.slug}/`} className="group block">
      <MediaPoster item={item} />
      <p className="eyebrow mt-4 flex items-center gap-2">
        <Diamond /> {MEDIA_KIND_META[item.kind].label}
        {item.length ? <span className="font-medium normal-case tracking-normal text-muted">· {item.length}</span> : null}
      </p>
      <h3 className="display mt-1.5 text-[24px] leading-tight group-hover:text-accent">{item.title}</h3>
      <p className="mt-1.5 text-[14px] text-ink-2">{item.summary}</p>
    </Link>
  )
}
