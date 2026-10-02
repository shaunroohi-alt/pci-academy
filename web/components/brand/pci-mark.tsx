import { cn } from '@/lib/utils'

// The PCI fine-line mark: P and C set in Cormorant Garamond (outlined), the
// ornamented I, and the geometric field behind them. Drawn in currentColor so
// it takes the theme's gold. Source artwork: public/brand/.
const P_GLYPH = 'M186 85Q186 55 194.5 39.5Q203 24 230 18Q257 12 311 12Q314 12 314 6Q314 0 311 0Q279 0 241.5 1Q204 2 160 2Q128 2 98 1Q68 0 44 0Q42 0 42 6Q42 12 44 12Q82 12 101 17Q120 22 126.5 37Q133 52 133 81V544Q133 573 126.5 587.5Q120 602 101 607.5Q82 613 44 613Q42 613 42 619Q42 625 44 625Q68 625 97.5 623.5Q127 622 159 622Q185 622 222 625Q259 628 299 628Q354 628 399 611Q444 594 470.5 558Q497 522 497 464Q497 411 477 373Q457 335 424.5 310.5Q392 286 353 274Q314 262 276 262Q263 262 250.5 263Q238 264 227 267Q223 268 224.5 274.5Q226 281 229 280Q238 278 247.5 277Q257 276 265 276Q309 276 348 294Q387 312 411 349.5Q435 387 435 444Q435 499 413.5 537Q392 575 356 595Q320 615 276 615Q240 615 220.5 611.5Q201 608 193.5 593Q186 578 186 542Z'
const C_GLYPH = 'M407 636Q452 636 484.5 632Q517 628 545 618.5Q573 609 604 593Q610 589 611.5 586.5Q613 584 614 571L626 457Q626 455 620.5 453.5Q615 452 614 456Q592 539 541.5 580.5Q491 622 407 622Q318 622 252 585Q186 548 149.5 480Q113 412 113 320Q113 255 136.5 197Q160 139 201.5 95Q243 51 296 26Q349 1 409 1Q495 1 547 42.5Q599 84 621 164Q622 167 627.5 166Q633 165 633 163L625 57Q624 45 622 42Q620 39 614 35Q561 7 515.5 -3Q470 -13 408 -13Q303 -13 222 28.5Q141 70 95 145Q49 220 49 319Q49 391 75.5 449Q102 507 150.5 549Q199 591 264 613.5Q329 636 407 636Z'

export function PciMark({ className, title = 'PCI' }: { className?: string; title?: string | null }) {
  return (
    <svg viewBox="490 340 940 1165" className={className} role={title ? 'img' : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g strokeWidth="1.6" opacity="0.5">
          <circle cx="957" cy="920" r="270" />
          <circle cx="957" cy="920" r="367" />
          <path d="M770 697 L957 354 L1143 697 M805 1140 L957 1410 L1110 1150" />
          <path d="M1283 1030 L1357 925 L1283 820 L1213 925 Z" />
        </g>
        <circle cx="957" cy="920" r="450" strokeWidth="5" strokeDasharray="0 16" opacity="0.8" />
        <path d="M957 1302 V1480 M1283 1084 V1222" strokeWidth="4" strokeDasharray="0 12" opacity="0.8" />
        <g strokeWidth="3">
          <path d="M957 462 L871 612 H1044 Z M957 440 V650" />
          <path d="M918 1236 H997 L957 1302 Z" />
          <path d="M1000 762 V1157" />
          <path d="M1283 710 L1255 763 H1312 Z M1245 765 H1322 V778 H1245 Z M1245 1066 H1322 V1079 H1245 Z M1275 778 V1066 M1292 778 V1066" />
          <path d="M1283 873 L1334 923 L1283 973 L1233 923 Z" />
        </g>
      </g>
      <g fill="currentColor">
        <path transform="translate(531.7 1080) scale(0.506 -0.506)" d={P_GLYPH} />
        <path transform="translate(805.2 1080) scale(0.506 -0.506)" d={C_GLYPH} />
        <circle cx="957" cy="395" r="6" />
        <circle cx="957" cy="650" r="6" />
        <circle cx="957" cy="920" r="11" />
        <circle cx="957" cy="1187" r="5" />
        <circle cx="957" cy="1335" r="6" />
        <circle cx="957" cy="1488" r="6" />
        <circle cx="507" cy="920" r="4" />
        <circle cx="1407" cy="920" r="4" />
        <circle cx="1283" cy="1230" r="6" />
      </g>
    </svg>
  )
}

// The bold gold-on-black seal, for small sizes and dark grounds.
export function PciSeal({ className, size = 32 }: { className?: string; size?: number }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${base}/brand/pci-seal-128.png`} srcSet={`${base}/brand/pci-seal-128.png 2x`} width={size} height={size} alt="" className={className} />
}

// Thin gold divider taken from the mark: hairline, dot, diamond, dot, hairline.
export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-brass', className)} aria-hidden>
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--brass)_55%,transparent)]" />
      <svg viewBox="0 0 64 16" className="h-3 w-12">
        <circle cx="4" cy="8" r="1.6" fill="currentColor" />
        <path d="M32 2 L38 8 L32 14 L26 8 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="32" cy="8" r="1.4" fill="currentColor" />
        <circle cx="60" cy="8" r="1.6" fill="currentColor" />
      </svg>
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--brass)_55%,transparent)]" />
    </div>
  )
}
