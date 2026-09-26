import type { SourceType } from './canon.ts'
import type { GuidedAnswers } from './schema.ts'

/** Prior material the engine may compare against — only with explicit permission (§9.1). */
export interface ArchiveSource {
  id: string
  kind: 'observation' | 'journal' | 'ledger' | 'contrary'
  date: string
  title: string
  text: string
}

export interface EngineInput {
  raw: string
  addenda: { id: string; text: string; created_at: string }[]
  guided?: GuidedAnswers
  source_type: SourceType
  mode: 'guided' | 'direct'
  created_at: string
  /** Present only when the user has enabled longitudinal comparison. */
  archive?: ArchiveSource[]
  options: { lenses: boolean; causal: boolean }
}
