// PCI Constitutional Validator (§2.2, §8.3).
//
// Scans every engine-authored string in an output and rejects language that
// crosses the PCI boundary: prescription, diagnosis, identity inflation,
// causal overreach, certainty inflation, moral ranking, forced positivity.
// Verbatim quotations of the user's own material are exempt — if the user
// wrote "you should", that is evidence, not engine output.
//
// Anchors are verified against the supplied material: a quote that does not
// occur in the material is an interpretation presented as direct
// observation, and is rejected.
import { BOUNDARY_STATEMENT } from './canon.ts'
import { FORBIDDEN_FIELDS, type Violation } from './schema.ts'

interface Rule {
  rule: string
  invariant: string
  re: RegExp
}

export const CONSTITUTIONAL_RULES: readonly Rule[] = [
  // observation -> prescription
  {
    rule: 'prescription.directive',
    invariant: 'observation → prescription',
    re: /\byou\s+(?:really\s+|probably\s+|just\s+)?(?:should|shouldn['’]t|ought\s+to|need\s+to|needn['’]t|have\s+to|must|had\s+better|['’]d\s+better)\b/i,
  },
  {
    rule: 'prescription.advice_verb',
    invariant: 'observation → prescription',
    re: /\b(?:i|we)\s+(?:would\s+|strongly\s+)?(?:recommend|suggest|advise|encourage|urge|invite\s+you)\b/i,
  },
  {
    rule: 'prescription.advice_noun',
    invariant: 'observation → prescription',
    re: /\b(?:my|our)\s+(?:recommendation|advice|suggestion)s?\b|\brecommended\s+(?:action|approach|step)s?\b/i,
  },
  {
    rule: 'prescription.right_choice',
    invariant: 'observation → prescription',
    re: /\bthe\s+(?:right|best|correct|wise|wisest|healthy|healthiest|appropriate)\s+(?:thing|choice|option|decision|path|move|course\s+of\s+action|response|way\s+forward)\b/i,
  },
  {
    rule: 'prescription.solution',
    invariant: 'observation → prescription',
    re: /\bthe\s+(?:solution|fix|cure|remedy|answer)\s+(?:is|would\s+be|here\s+is|lies)\b/i,
  },
  {
    rule: 'prescription.correction',
    invariant: 'observation → prescription',
    re: /\b(?:heal|fix|overcome|work\s+on|let\s+go\s+of|get\s+over|move\s+past|move\s+on\s+from|improve|correct)\s+(?:this|that|it|your|yourself|these|those)\b/i,
  },
  {
    rule: 'prescription.imperative',
    invariant: 'observation → prescription',
    re: /(?:^|[.!?:;]\s+|\n\s*)(?:try|consider|remember|make\s+sure|allow\s+yourself|give\s+yourself|focus\s+on|practi[cs]e|reflect\s+on|ask\s+yourself|take\s+time|avoid|remind\s+yourself|let\s+yourself|be\s+kind|reach\s+out|talk\s+to|seek|embrace|accept|forgive|choose|decide|commit)\b/i,
  },
  {
    rule: 'prescription.next_steps',
    invariant: 'observation → prescription',
    re: /\bnext\s+steps?\b|\baction\s+(?:plan|items?|steps?)\b|\bgoing\s+forward,?\s+you\b/i,
  },
  {
    rule: 'prescription.would_help',
    invariant: 'observation → prescription',
    re: /\bit\s+(?:would|might|could|may)\s+(?:help|be\s+(?:helpful|useful|wise|good|best|beneficial|worth\s+\w+ing))\b/i,
  },
  {
    rule: 'prescription.you_could',
    invariant: 'observation → prescription',
    re: /\byou\s+(?:can|could|might\s+want\s+to|may\s+want\s+to|may\s+wish\s+to)\s+(?:try|consider|start|begin|work|choose|decide|practi[cs]e|focus|reflect|explore|seek|let|allow|stop)\b/i,
  },
  {
    rule: 'obligation.from_visibility',
    invariant: 'visibility → obligation',
    re: /\bit\s+is\s+(?:time|up\s+to\s+you)\s+to\b|\bnow\s+that\s+(?:you|this)\s+(?:see|know|is\s+visible)\b/i,
  },
  // behavior -> permanent identity; identity language -> ontology
  {
    rule: 'identity.inference',
    invariant: 'behavior → permanent identity',
    re: /\b(?:this|that|it|which)\s+(?:means|shows|proves|suggests|indicates|reveals|demonstrates|confirms)\s+(?:that\s+)?(?:you|they|he|she)\s+(?:are|is)\b/i,
  },
  {
    rule: 'identity.true_self',
    invariant: 'identity language → ontology',
    re: /\byour\s+(?:true|real|authentic|hidden|essential|core|deep(?:est)?)\s+(?:self|nature|identity|essence|character)\b|\bwho\s+you\s+(?:really|truly)\s+are\b/i,
  },
  {
    rule: 'identity.essentialism',
    invariant: 'identity language → ontology',
    re: /\byou\s+are\s+(?:fundamentally|essentially|inherently|basically|at\s+heart|deep\s+down|by\s+nature|really|truly|simply)\b/i,
  },
  {
    rule: 'identity.typing',
    invariant: 'behavior → permanent identity',
    re: /\b(?:you|they|he|she)\s+(?:are|is)\s+(?:an?\s+)?(?:narcissist|introvert|extrovert|empath|people[- ]pleaser|perfectionist|codependent|avoidant|anxious\s+type|type\s+[a-z0-9]+)\b/i,
  },
  // pattern -> diagnosis
  {
    rule: 'diagnosis.suffering',
    invariant: 'pattern → diagnosis',
    re: /\b(?:you|they|he|she)\s+(?:suffer|suffers|are\s+suffering|is\s+suffering|seem\s+to\s+suffer)\s+from\b/i,
  },
  {
    rule: 'diagnosis.condition',
    invariant: 'pattern → diagnosis',
    re: /\b(?:you|they|he|she)\s+(?:have|has|may\s+have|might\s+have|likely\s+ha(?:ve|s)|probably\s+ha(?:ve|s)|show\s+signs\s+of|shows\s+signs\s+of|display|exhibit|are\s+showing)\s+(?:signs\s+of\s+|symptoms\s+of\s+)?(?:clinical\s+)?(?:depression|anxiety|adhd|ptsd|c-ptsd|bpd|ocd|bipolar|autism|trauma|a\s+disorder|a\s+condition|narcissis\w*|attachment\s+(?:issues|disorder|wounds?))\b/i,
  },
  {
    rule: 'diagnosis.clinical_language',
    invariant: 'pattern → diagnosis',
    re: /\b(?:diagnos(?:is|e|ed|able|tic)|disorder|psychopatholog\w*|pathological|clinically|symptoms?\s+of|dysfunction(?:al)?|maladaptive|unhealthy\s+coping|toxic)\b/i,
  },
  // contradiction -> pathology
  {
    rule: 'contradiction.pathologised',
    invariant: 'contradiction → pathology',
    re: /\b(?:hypocri(?:te|sy|tical)|in\s+denial|self[- ]sabotag\w*|self[- ]destructive|cognitive\s+distortions?|distorted\s+thinking|irrational\s+belief)\b/i,
  },
  // emotion -> error
  {
    rule: 'emotion.as_error',
    invariant: 'emotion → error',
    re: /\b(?:overreact(?:ed|ing|ion)?|irrational(?:ly)?|unreasonabl[ey]|too\s+sensitive|oversensitive|(?:shouldn['’]t|should\s+not)\s+(?:feel|have\s+felt)|no\s+reason\s+to\s+(?:feel|be))\b/i,
  },
  // correlation -> causation; sequence -> mechanism; recurrence -> origin
  {
    rule: 'causation.asserted',
    invariant: 'correlation → causation',
    re: /\b(?:proves?|proven|proof\s+that|caused\s+by|is\s+because\s+of|stems?\s+from|originat(?:es|ed|ing)\s+(?:in|from)|the\s+(?:root\s+)?cause\s+(?:of|is)|root\s+cause|traces?\s+back\s+to|is\s+rooted\s+in|is\s+the\s+result\s+of|results?\s+from|led\s+to\s+(?:you|this)|due\s+to\s+your)\b/i,
  },
  // confidence -> certainty
  {
    rule: 'certainty.inflated',
    invariant: 'confidence → certainty',
    re: /\b(?:certainly|definitely|undoubtedly|unquestionably|without\s+(?:a\s+)?doubt|beyond\s+doubt|clearly\s+(?:shows|proves|means|indicates)|it\s+is\s+(?:clear|obvious|certain)\s+that|obviously|will\s+always|always\s+will|will\s+never|never\s+will|guaranteed)\b/i,
  },
  {
    rule: 'certainty.numeric',
    invariant: 'confidence → certainty',
    re: /\b\d{1,3}(?:\.\d+)?\s*(?:%|percent)(?=\W|$)|\b(?:score|rating)\s*(?:of|:)\s*\d/i,
  },
  // moral ranking
  {
    rule: 'moral.ranking',
    invariant: 'observation → prescription',
    re: /\b(?:good|bad|better|worse|best|worst|weak|strong|mature|immature)\s+(?:person|people|human\s+being|partner|parent|character)\b|\b(?:you\s+were|you\s+are|you['’]re|they\s+were|they\s+are)\s+(?:wrong|right|to\s+blame|at\s+fault|justified)\b/i,
  },
  // forced positivity / victim-blaming (On the Contrary safety, §15)
  {
    rule: 'contrary.forced_positivity',
    invariant: 'observation → prescription',
    re: /\b(?:happened\s+for\s+a\s+reason|everything\s+happens\s+for\s+a\s+reason|blessing\s+in\s+disguise|silver\s+lining|bright\s+side|meant\s+to\s+be|gift\s+in\s+disguise|opportunity\s+for\s+growth|growth\s+opportunity|the\s+universe\s+(?:is\s+)?(?:teaching|telling))\b/i,
  },
  {
    rule: 'contrary.victim_blaming',
    invariant: 'observation → prescription',
    re: /\byou\s+(?:attracted|manifested|invited|caused|created|allowed)\s+(?:this|that|it|them|him|her)\b|\b(?:deserved\s+(?:it|this|that)|had\s+it\s+coming|asked\s+for\s+it)\b/i,
  },
  // symbol -> fact; philosophical coherence -> empirical proof
  {
    rule: 'symbol.as_fact',
    invariant: 'symbol → fact',
    re: /\b(?:the\s+dream|this\s+dream|this\s+symbol|the\s+symbol|the\s+archetype)\s+(?:proves|means\s+that|shows\s+that|reveals\s+that|is\s+telling\s+you|is\s+a\s+sign)\b/i,
  },
  {
    rule: 'philosophy.as_proof',
    invariant: 'philosophical coherence → empirical proof',
    re: /\b(?:scientifically|empirically)\s+(?:proven|established|demonstrated)\b/i,
  },
]

// Keys whose string values are the user's material, not engine speech.
const USER_MATERIAL_KEYS = new Set([
  'quote',
  'event',
  'behavior',
  'interpretation',
  'emotion',
  'judgment',
  'assumptions',
  'identity_attribution',
  'context',
  'evidence_anchors',
  'time_reference',
])

// Keys whose values are identifiers or enums rather than prose.
const NON_PROSE_KEYS = new Set([
  'id',
  'record_id',
  'source_id',
  'source_date',
  'first_observed',
  'last_observed',
  'pattern_id',
  'from',
  'to',
  'compared',
  'supports',
  'epistemic_class',
  'confidence',
  'temporal_class',
  'contradiction_class',
  'relationship',
  'dimension',
  'check',
  'result',
  'status',
  'scope',
  'basis',
  'stage',
  'lens',
  'label',
  'source_type',
  'mode',
  'subject',
  'meaning',
  'time',
  'observer',
  'boundary',
  'compared_on',
])

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripEdgePunctuation(text: string): string {
  return text.replace(/^[\s"'(\[.,;:!?…-]+|[\s"')\].,;:!?…-]+$/g, '')
}

/** True when `quote` occurs verbatim (modulo case, whitespace, quote marks) in `material`. */
export function occursIn(quote: string, material: string): boolean {
  const q = normalize(stripEdgePunctuation(quote))
  if (!q) return true
  return normalize(material).includes(q)
}

/**
 * Remove quoted segments that genuinely quote the user's material, so the
 * user's own words are not treated as engine speech. Quoted text that does
 * not occur in the material stays in place and is scanned.
 */
export function stripVerifiedQuotes(text: string, material: string): string {
  return text.replace(/“([^”]*)”|"([^"]*)"|‘([^’]*)’/g, (whole, a, b, c) => {
    const inner = a ?? b ?? c ?? ''
    return material && occursIn(inner, material) ? ' ' : whole
  })
}

export function scanText(text: string, material = '', path = '$'): Violation[] {
  const scanned = stripVerifiedQuotes(text, material)
  const out: Violation[] = []
  for (const r of CONSTITUTIONAL_RULES) {
    const m = r.re.exec(scanned)
    if (m) {
      const start = Math.max(0, m.index - 30)
      out.push({
        rule: r.rule,
        invariant: r.invariant,
        path,
        excerpt: scanned.slice(start, m.index + m[0].length + 30).trim(),
      })
    }
  }
  return out
}

export interface ValidationContext {
  /** Everything the engine was given: raw input, addenda, guided answers. */
  material: string
  /** Archive sources the engine was permitted to compare against, by id. */
  archive?: Record<string, string>
}

export interface ValidationResult {
  ok: boolean
  violations: Violation[]
}

/** Validate any engine output object (pre- or post-schema). */
export function validateOutput(output: unknown, ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = []
  const archiveText = ctx.archive ? Object.values(ctx.archive).join('\n') : ''
  const allMaterial = archiveText ? `${ctx.material}\n${archiveText}` : ctx.material

  const walk = (node: unknown, path: string, key: string | null, inUserMaterial: boolean) => {
    if (node === null || node === undefined) return
    if (key && NON_PROSE_KEYS.has(key)) return
    if (typeof node === 'string') {
      if (key === 'time_reference' && node === 'unknown') return
      if (inUserMaterial) {
        if (!occursIn(node, allMaterial)) {
          violations.push({
            rule: 'evidence.unanchored_quote',
            invariant: 'interpretation → direct observation',
            path,
            excerpt: node.slice(0, 120),
          })
        }
        return
      }
      violations.push(...scanText(node, allMaterial, path))
      return
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, key, inUserMaterial))
      return
    }
    if (typeof node === 'object') {
      // An object's own keys decide what is user material; the flag does not
      // pass through (decomposition.context holds objects with engine notes).
      const obj = node as Record<string, unknown>
      for (const [k, v] of Object.entries(obj)) {
        if ((FORBIDDEN_FIELDS as readonly string[]).includes(k)) {
          violations.push({
            rule: 'schema.forbidden_field',
            invariant: 'observation → prescription',
            path: `${path}.${k}`,
            excerpt: k,
          })
          continue
        }
        // Archive anchors must quote the archive entry they cite.
        if (k === 'quote' && typeof v === 'string' && typeof obj.source_id === 'string' && ctx.archive?.[obj.source_id]) {
          if (!occursIn(v, ctx.archive[obj.source_id]) && !occursIn(v, ctx.material)) {
            violations.push({
              rule: 'evidence.unanchored_quote',
              invariant: 'interpretation → direct observation',
              path: `${path}.${k}`,
              excerpt: v.slice(0, 120),
            })
          }
          continue
        }
        walk(v, `${path}.${k}`, k, USER_MATERIAL_KEYS.has(k))
      }
    }
  }

  walk(output, '$', null, false)

  // Structural invariants beyond language.
  if (output && typeof output === 'object') {
    const r = output as Record<string, unknown>
    if ('boundary' in r && r.boundary !== BOUNDARY_STATEMENT) {
      violations.push({ rule: 'boundary.missing', invariant: 'observation → prescription', path: '$.boundary', excerpt: String(r.boundary).slice(0, 80) })
    }
    const ops = r.operations as Record<string, { represented?: boolean }> | undefined
    if (ops) {
      for (const [k, v] of Object.entries(ops)) {
        if (!v?.represented) {
          violations.push({ rule: 'operations.unrepresented', invariant: 'canon', path: `$.operations.${k}`, excerpt: k })
        }
      }
    }
    const sep = r.epistemic_separation as Record<string, { epistemic_class: string; anchors: unknown[]; id: string }[]> | undefined
    if (sep?.evidence) {
      for (const item of sep.evidence) {
        if (!item.anchors?.length) {
          violations.push({
            rule: 'evidence.without_anchor',
            invariant: 'interpretation → direct observation',
            path: `$.epistemic_separation.evidence.${item.id}`,
            excerpt: item.id,
          })
        }
        if (item.epistemic_class !== 'DIRECT' && item.epistemic_class !== 'SELF_REPORTED') {
          violations.push({
            rule: 'evidence.misclassified',
            invariant: 'interpretation → direct observation',
            path: `$.epistemic_separation.evidence.${item.id}`,
            excerpt: item.epistemic_class,
          })
        }
      }
    }
    const patterns = r.patterns as { id: string; basis: string; epistemic_class: string; occurrences: { source_id?: string }[] }[] | undefined
    for (const p of patterns ?? []) {
      if (p.basis === 'reported' && p.epistemic_class === 'PATTERN_SUPPORTED') {
        violations.push({ rule: 'pattern.reported_as_supported', invariant: 'recurrence → origin', path: `$.patterns.${p.id}`, excerpt: p.id })
      }
      if (p.basis === 'documented') {
        const sources = new Set(p.occurrences.map((o) => o.source_id ?? 'current'))
        if (sources.size < 2) {
          violations.push({ rule: 'pattern.single_source', invariant: 'recurrence → origin', path: `$.patterns.${p.id}`, excerpt: p.id })
        }
      }
    }
    const causal = r.causal_hypotheses as { id: string; alternative_mechanisms: string[]; confidence: string }[] | undefined
    for (const c of causal ?? []) {
      if (!c.alternative_mechanisms?.length) {
        violations.push({ rule: 'causal.no_alternative', invariant: 'sequence → mechanism', path: `$.causal_hypotheses.${c.id}`, excerpt: c.id })
      }
      if (c.confidence === 'High Support') {
        violations.push({ rule: 'causal.overconfident', invariant: 'confidence → certainty', path: `$.causal_hypotheses.${c.id}`, excerpt: c.id })
      }
    }
  }

  return { ok: violations.length === 0, violations }
}

/** Convenience for single strings (prompts, notes, UI copy). */
export function validateText(text: string, material = ''): ValidationResult {
  const violations = scanText(text, material)
  return { ok: violations.length === 0, violations }
}

/** Logging redaction (§9.1): never write user material to logs. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.length ? `[redacted:${value.length}]` : ''
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, NON_PROSE_KEYS.has(k) ? v : redact(v)]))
  }
  return value
}
