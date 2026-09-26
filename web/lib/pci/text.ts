// Text utilities for the local PCI engine. Everything returned as a
// "fragment" is a verbatim substring of the input, so it can serve as an
// evidence anchor.

export interface Sentence {
  index: number
  text: string
  start: number
}

export interface Clause {
  sentence: number
  index: number
  text: string
  connector: string | null
  /** The sentence this clause belongs to ends with a question mark. */
  question: boolean
}

const ABBREVIATIONS = /\b(?:mr|mrs|ms|dr|prof|st|vs|etc|e\.g|i\.e|approx)\.$/i

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = []
  const re = /[^.!?\n]+(?:[.!?]+["'”’)]*|\n|$)/g
  let buffer = ''
  let bufferStart = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (!m[0]) {
      re.lastIndex++
      continue
    }
    const piece = m[0]
    if (!buffer) bufferStart = m.index
    buffer += piece
    const trimmed = buffer.trim()
    if (ABBREVIATIONS.test(trimmed) && !piece.endsWith('\n')) continue
    if (trimmed.length > 0) {
      const lead = buffer.length - buffer.trimStart().length
      out.push({ index: out.length, text: trimmed, start: bufferStart + lead })
    }
    buffer = ''
  }
  if (buffer.trim()) out.push({ index: out.length, text: buffer.trim(), start: bufferStart })
  return out
}

// Clause boundaries: punctuation, and conjunctions. "so", "then", "yet",
// "which" and "since" split only after a comma, because they are just as
// often intensifiers or adverbs ("so selfish", "since then").
const CLAUSE_SPLIT =
  /\s*(?:;|:\s|\s[-–—]\s)\s*|\s*,\s+(?=(?:so|then|yet|which|since)\b)|\s*,?\s+(?=(?:but|because|although|though|so\s+that|whereas|while|and\s+then|and\s+so|until|unless|even\s+though)\b)/i

export function splitClauses(sentence: Sentence): Clause[] {
  const parts = sentence.text.split(CLAUSE_SPLIT).map((p) => p.trim()).filter(Boolean)
  return parts.map((text, index) => {
    const cm = /^(but|because|although|though|so that|so|yet|whereas|while|which|since|and then|and so|then|until|unless|even though)\b/i.exec(
      text,
    )
    return {
      sentence: sentence.index,
      index,
      text: text.replace(/[.!]+$/, ''),
      connector: cm ? cm[1].toLowerCase() : null,
      question: /\?["'”’)]*$/.test(sentence.text),
    }
  })
}

export const STOPWORDS = new Set(
  (
    'a an the and or but if then so of to in on at by for with about against between into through during before after above below from up down out off over under again further once here there when where why how all any both each few more most other some such no nor not only own same than too very can will just don should now i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself it its itself they them their theirs themselves what which who whom this that these those am is are was were be been being have has had having do does did doing would could ought im ive id youre hes shes its were theyre dont didnt doesnt isnt wasnt werent cant couldnt wont wouldnt shouldnt havent hasnt hadnt as until while because also get got getting go going went gone really like just thing things something anything nothing everything one ones even still much many lot lots way today yesterday tomorrow day time made make makes know knew think thought said say says told tell felt feel feeling feels want wanted back well yeah okay ok maybe though already ever every always never'
  ).split(' '),
)

/** Normalise apostrophe variants to ASCII. Length-preserving, so match indices map back to the original. */
export function apos(text: string): string {
  return text.replace(/[’‘ʼ`´]/g, "'")
}

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[’']/g, '')
      .match(/[a-z][a-z-]*[a-z]|[a-z]/g) ?? []
  )
}

/** Light suffix stripping so "deadlines"/"deadline" and "avoiding"/"avoid" meet. */
export function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ies')) w = w.slice(0, -3) + 'y'
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && /(?:ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 4 && /([bdgmnprt])\1$/.test(w)) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}

export function contentTerms(text: string): string[] {
  return tokenize(text)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem)
}

export function unique<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)]
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

/** Return the verbatim substring of `text` matched by `re`, extended to word boundaries. */
export function matchFragment(text: string, re: RegExp): string | null {
  const m = re.exec(text)
  return m ? m[0].trim() : null
}

export function truncate(text: string, max = 140): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)) + '…'
}

/** Deterministic, non-cryptographic content hash (FNV-1a 32-bit, hex). */
export function contentHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

/** Wrap user words in typographic quotes for engine-authored notes. */
export function q(fragment: string): string {
  return `“${fragment.replace(/[“”"]/g, '')}”`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Map stems back to the first surface form seen, so findings show real words. */
export function surfaceMap(...texts: string[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const text of texts) {
    for (const t of tokenize(text)) {
      if (t.length <= 2 || STOPWORDS.has(t)) continue
      const s = stem(t)
      if (!m.has(s)) m.set(s, t)
    }
  }
  return m
}
