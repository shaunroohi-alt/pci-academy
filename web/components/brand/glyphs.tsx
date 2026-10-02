import * as React from 'react'
import { cn } from '@/lib/utils'

// Geometric glyphs drawn from the PCI mark. Each one stands for a principle,
// so the same shapes recur wherever that principle appears in the interface.

type GlyphProps = { className?: string }

function Frame({ className, children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-10 w-10', className)} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

/** Input — the centre point: material before explanation. */
export const InputGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <circle cx="24" cy="24" r="16" strokeDasharray="0 4.2" strokeWidth="1.8" />
    <circle cx="24" cy="24" r="3.6" fill="currentColor" stroke="none" />
  </Frame>
)

/** Decomposition — one whole divided into parts. */
export const DecompositionGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <circle cx="24" cy="24" r="16" />
    <path d="M24 8 V40 M10.1 16 L37.9 32 M10.1 32 L37.9 16" opacity="0.7" />
    <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none" />
  </Frame>
)

/** Contextual comparison — two contexts, overlapping only where evidence allows. */
export const ComparisonGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <circle cx="18" cy="24" r="12" />
    <circle cx="30" cy="24" r="12" />
  </Frame>
)

/** Pattern detection — the same form recurring. */
export const PatternGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <path d="M8 30 L14 20 L20 30 Z M21 30 L27 20 L33 30 Z M34 30 L40 20 L46 30 Z" transform="translate(-3 0)" />
    <path d="M6 36 H42" strokeDasharray="0 4" strokeWidth="1.8" />
  </Frame>
)

/** Contradiction detection — opposed triangles held on one axis. */
export const ContradictionGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <path d="M24 6 L33 20 H15 Z" />
    <path d="M15 28 H33 L24 42 Z" />
    <path d="M24 2 V46" opacity="0.5" />
  </Frame>
)

/** Evidentiary separation — concentric layers kept apart. */
export const SeparationGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <circle cx="24" cy="24" r="5" fill="currentColor" stroke="none" />
    <circle cx="24" cy="24" r="11" />
    <circle cx="24" cy="24" r="17" opacity="0.7" />
    <circle cx="24" cy="24" r="22" strokeDasharray="0 3.6" strokeWidth="1.6" />
  </Frame>
)

/** Observational report — the diamond of the I: something made visible. */
export const ReportGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <path d="M24 8 L38 24 L24 40 L10 24 Z" opacity="0.6" />
    <path d="M24 15 L33 24 L24 33 L15 24 Z" />
    <circle cx="24" cy="24" r="2.4" fill="currentColor" stroke="none" />
  </Frame>
)

/** STOP — the capped staff: the engine ends at observation. */
export const StopGlyph = ({ className }: GlyphProps) => (
  <Frame className={className}>
    <path d="M24 4 L20 11 H28 Z" />
    <rect x="16" y="12" width="16" height="3" />
    <path d="M22 15 V33 M26 15 V33" />
    <rect x="16" y="33" width="16" height="3" />
    <path d="M24 36 V44" strokeDasharray="0 3.2" strokeWidth="1.8" />
  </Frame>
)

export const PIPELINE_GLYPHS = [InputGlyph, DecompositionGlyph, ComparisonGlyph, PatternGlyph, ContradictionGlyph, SeparationGlyph, ReportGlyph, StopGlyph]

/** Small diamond used as a bullet and active marker. */
export const Diamond = ({ className }: GlyphProps) => (
  <svg viewBox="0 0 10 10" className={cn('h-2 w-2', className)} aria-hidden>
    <path d="M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5" cy="5" r="1.2" fill="currentColor" />
  </svg>
)

/** Large faint geometric field behind every page: the mark's circles and axis. */
export function BrandBackdrop({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 1000 1000" className={cn('pointer-events-none select-none text-brass', className)} fill="none" stroke="currentColor" aria-hidden>
      <g opacity="0.32">
        <circle cx="500" cy="500" r="300" strokeWidth="1" />
        <circle cx="500" cy="500" r="408" strokeWidth="1" />
        <circle cx="500" cy="500" r="490" strokeWidth="2.2" strokeDasharray="0 14" strokeLinecap="round" />
        <path d="M500 0 V1000" strokeWidth="1" opacity="0.6" />
        <path d="M500 40 L760 500 L500 960 L240 500 Z" strokeWidth="1" opacity="0.7" />
      </g>
      <g fill="currentColor" stroke="none" opacity="0.5">
        <circle cx="500" cy="200" r="4" />
        <circle cx="500" cy="500" r="6" />
        <circle cx="500" cy="800" r="4" />
      </g>
    </svg>
  )
}
