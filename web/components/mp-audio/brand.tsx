import type { Plugin } from '@/lib/mp-audio/catalog'

/** MP Audio monogram: "MP" set over a short waveform inside a rounded tile. */
export function MpLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="9" fill="var(--mpa-panel-2)" stroke="var(--mpa-line-strong)" />
      <path
        d="M6 27h4l2-5 3 9 3-14 3 16 3-11 2 5h8"
        fill="none"
        stroke="var(--mpa-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="20" y="15.5" textAnchor="middle" fontSize="10" fontWeight="800" letterSpacing="0.5" fill="var(--mpa-ink)" fontFamily="Inter, system-ui, sans-serif">
        MP
      </text>
    </svg>
  )
}

export function MpWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-extrabold tracking-[0.18em]">MP</span>
      <span className="ml-1.5 font-medium tracking-[0.32em] text-[var(--mpa-muted)]">AUDIO</span>
    </span>
  )
}

// Small deterministic PRNG so each plugin's faceplate is stable between builds.
function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function Knob({ cx, cy, r, value, hue }: { cx: number; cy: number; r: number; value: number; hue: number }) {
  const start = 135
  const sweep = 270 * value
  const rad = (d: number) => (d * Math.PI) / 180
  const arcR = r + 5
  const a0 = rad(start)
  const a1 = rad(start + sweep)
  const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`
  return (
    <g>
      <path d={`M${p(a0, arcR)} A${arcR} ${arcR} 0 1 1 ${p(rad(start + 270), arcR)}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" strokeLinecap="round" />
      <path d={`M${p(a0, arcR)} A${arcR} ${arcR} 0 ${sweep > 180 ? 1 : 0} 1 ${p(a1, arcR)}`} fill="none" stroke={`hsl(${hue} 90% 60%)`} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="#1b1d22" stroke="rgba(255,255,255,0.14)" />
      <line x1={cx} y1={cy} x2={cx + (r - 3) * Math.cos(a1)} y2={cy + (r - 3) * Math.sin(a1)} stroke="#f4f4f5" strokeWidth="2" strokeLinecap="round" />
    </g>
  )
}

/** Generated plugin faceplate: knobs, a meter and a display, tinted by the plugin's hue. */
export function PluginArt({ plugin, className }: { plugin: Plugin; className?: string }) {
  const rnd = seeded(plugin.slug)
  const knobs = [0, 1, 2, 3].map(() => 0.15 + rnd() * 0.75)
  const bars = Array.from({ length: 28 }, (_, i) => {
    const base = plugin.kind === 'instrument' ? Math.sin(i / 2.2) * 0.35 + 0.5 : 1 - Math.abs(i - 14) / 18
    return Math.max(0.08, Math.min(1, base + (rnd() - 0.5) * 0.35))
  })
  const h = plugin.hue
  return (
    <svg viewBox="0 0 320 180" className={className} role="img" aria-label={`${plugin.name} interface preview`}>
      <defs>
        <linearGradient id={`face-${plugin.slug}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 30% 17%)`} />
          <stop offset="1" stopColor={`hsl(${h} 25% 9%)`} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#face-${plugin.slug})`} />
      <rect x="14" y="14" width="190" height="78" rx="6" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.08)" />
      {bars.map((v, i) => (
        <rect key={i} x={22 + i * 6.4} y={84 - v * 62} width="4" height={v * 62} rx="1" fill={`hsl(${h} 90% ${50 + v * 20}%)`} opacity={0.35 + v * 0.65} />
      ))}
      <rect x="218" y="14" width="88" height="78" rx="6" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.08)" />
      {[0, 1].map((m) => (
        <g key={m}>
          <rect x={236 + m * 34} y="24" width="16" height="58" rx="2" fill="rgba(255,255,255,0.06)" />
          <rect x={236 + m * 34} y={24 + 58 * (1 - knobs[m] * 0.9)} width="16" height={58 * knobs[m] * 0.9} rx="2" fill={`hsl(${h} 85% 58%)`} />
        </g>
      ))}
      {knobs.map((v, i) => (
        <Knob key={i} cx={46 + i * 76} cy={134} r={15} value={v} hue={h} />
      ))}
      <text x="306" y="170" textAnchor="end" fontSize="9" fontWeight="700" letterSpacing="2" fill="rgba(255,255,255,0.45)" fontFamily="Inter, system-ui, sans-serif">
        MP AUDIO
      </text>
    </svg>
  )
}
