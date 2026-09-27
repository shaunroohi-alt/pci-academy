// Related-entry detection (§3.3). Lexical similarity only, and only with
// longitudinal permission. Relatedness is shown with the shared words that
// produced it, so it can be judged rather than trusted.
import { buildCorpus, cosine, sharedTerms, vectorize } from '@/lib/pci/vector'
import { surfaceMap } from '@/lib/pci/text'

export interface Relatable {
  id: string
  text: string
  date: string
  title: string
  href: string
}

export interface Related<T extends Relatable> {
  item: T
  similarity: number
  shared: string[]
}

export function relatedTo<T extends Relatable>(target: { id: string; text: string }, pool: T[], limit = 3, threshold = 0.12): Related<T>[] {
  const others = pool.filter((p) => p.id !== target.id && p.text.trim())
  if (!target.text.trim() || !others.length) return []
  const corpus = buildCorpus([target.text, ...others.map((o) => o.text)])
  const v = vectorize(target.text, corpus)
  return others
    .map((item) => {
      const w = vectorize(item.text, corpus)
      const surface = surfaceMap(target.text, item.text)
      return { item, similarity: cosine(v, w), shared: sharedTerms(v, w, 4).map((s) => surface.get(s) ?? s) }
    })
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}
