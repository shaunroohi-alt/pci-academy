// Lexical similarity (TF-IDF cosine). This is keyword overlap, not
// semantic understanding, and the interface says so.
import { contentTerms } from './text.ts'

export type Vec = Map<string, number>

export interface Corpus {
  idf: Map<string, number>
  docs: number
}

export function termFreq(text: string): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of contentTerms(text)) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

export function buildCorpus(texts: string[]): Corpus {
  const df = new Map<string, number>()
  for (const text of texts) for (const t of new Set(contentTerms(text))) df.set(t, (df.get(t) ?? 0) + 1)
  const docs = texts.length
  const idf = new Map<string, number>()
  for (const [t, n] of df) idf.set(t, Math.log((docs + 1) / (n + 0.5)) + 1)
  return { idf, docs }
}

export function vectorize(text: string, corpus: Corpus): Vec {
  const tf = termFreq(text)
  const v: Vec = new Map()
  for (const [t, n] of tf) v.set(t, (1 + Math.log(n)) * (corpus.idf.get(t) ?? Math.log(corpus.docs + 1) + 1))
  return v
}

export function cosine(a: Vec, b: Vec): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [, x] of a) na += x * x
  for (const [, y] of b) nb += y * y
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  for (const [t, x] of small) {
    const y = large.get(t)
    if (y) dot += x * y
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export function sharedTerms(a: Vec, b: Vec, limit = 6): string[] {
  const out: [string, number][] = []
  for (const [t, x] of a) {
    const y = b.get(t)
    if (y) out.push([t, x * y])
  }
  return out.sort((p, q) => q[1] - p[1]).slice(0, limit).map(([t]) => t)
}

/** Hashed bag-of-words embedding for the provider interface's embed(). */
export function hashedEmbedding(text: string, dims = 256): number[] {
  const v = new Array<number>(dims).fill(0)
  for (const t of contentTerms(text)) {
    let h = 2166136261
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619)
    v[(h >>> 0) % dims] += 1
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}
