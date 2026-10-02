import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ART_OF_BEING, COMPANION, LIBRARY } from '@/content/seeds/art-of-being'
import { FRAMEWORK } from '@/content/seeds/framework'
import { GLOSSARY } from '@/content/seeds/glossary'
import { ARTICLES, CHAPTERS, SUB_CHAPTERS } from '@/content/site'
import { hrefFor, mergeContent, neighbours, published, readable, SEED_CONTENT, TERM_BY_SLUG } from '@/lib/content/catalog'
import { canTransition, LifecycleError, revise, transition } from '@/lib/content/lifecycle'
import { parseBlocks, parseInline } from '@/lib/content/markdown'
import { isPubliclyVisible, validateForPublication } from '@/lib/content/validation'
import { resolveNarration } from '@/lib/audio/narration'
import { can, flagsForPlan } from '@/lib/entitlements'

const ROOT = join(__dirname, '..', '..')
const LIVE = [...ART_OF_BEING, ...COMPANION, ...LIBRARY].filter((c) => c.body)

describe('Publication validation (R0.4)', () => {
  it('every published seed item is complete', () => {
    for (const item of SEED_CONTENT.filter((i) => i.status === 'published')) {
      expect(validateForPublication(item), item.slug).toEqual({ ok: true, errors: [] })
    }
  })

  it('a title without a body fails', () => {
    const r = validateForPublication(ART_OF_BEING.find((c) => c.slug === 'introduction')!)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/title without a body/)
  })

  it('placeholder text fails', () => {
    const r = validateForPublication({ ...ART_OF_BEING.find((c) => c.slug === 'chapter-01')!, body: 'A complete chapter. '.repeat(40) + ' TBD' })
    expect(r.ok).toBe(false)
  })

  it('publishes the live corpus — twelve chapters, five articles, two sub-chapters — and nothing else', () => {
    const live = published(SEED_CONTENT)
    expect(live.filter((c) => c.collection === 'art-of-being').map((c) => c.slug)).toEqual(Array.from({ length: 12 }, (_, i) => `chapter-${String(i + 1).padStart(2, '0')}`))
    expect(live.filter((c) => c.collection === 'companion').map((c) => c.slug)).toEqual(['the-aaa-method', 'to-sing-is-to-breathe', 'being-is-becoming', 'the-neutral-gateway', 'your-business-evolves-around-others'])
    expect(live.filter((c) => c.collection === 'library').map((c) => c.slug)).toEqual(['other-peoples-material', 'coherence-in-business'])
    expect(live).toHaveLength(19)
    // Front and back matter have no text yet, so they are not listed by title alone.
    for (const slug of ['introduction', 'book-glossary', 'appendix', 'references']) expect(live.some((c) => c.slug === slug), slug).toBe(false)
  })

  it('keeps the blueprint framework texts out of the Library', () => {
    expect(FRAMEWORK).toHaveLength(15)
    for (const f of FRAMEWORK) {
      expect(f.status, f.slug).toBe('draft')
      expect(isPubliclyVisible(f), f.slug).toBe(false)
      expect(readable(f), f.slug).toBeUndefined()
    }
    expect(published(SEED_CONTENT).some((c) => c.collection === 'pci-framework')).toBe(false)
  })

  it('chapter order and titles follow the author’s manuscript', () => {
    const chapters = ART_OF_BEING.filter((c) => c.type === 'chapter')
    expect(chapters.map((c) => c.order)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(chapters.map((c) => c.title)).toEqual([
      'Discover Your Hidden Abilities',
      'Practice as a Mythology',
      'You Were Finished at Birth',
      'Darkness Is an Opportunity to Shine',
      'Individualism',
      'The Principle of Balance',
      'Identity — The Field of Possibilities',
      'Growth Is Effortless',
      'You Are Bound to Choose / Perpetual Becoming',
      'The Observer Gets Observed / Judgment as Cognitive Processing',
      'The Illusion of Challenge / Problem Is a Construct / Emotion as Feedback / Emotion Without Possession',
      'Repetition Is Not Repetition',
    ])
    expect(COMPANION.map((c) => c.title)).toEqual([
      'The AAA Method — Adopt, Allow, Align',
      'To Sing Is to Breathe; To Breathe Is to Be',
      'Being Is Becoming',
      'The Neutral Gateway / Neutrality and Subtlety — The Forgotten Power',
      'YOUR “BUSINESS” EVOLVES AROUND OTHERS',
    ])
    expect(LIBRARY.map((c) => c.title)).toEqual(['Other People’s Material', 'Coherence in Business'])
  })

  it('every live text carries the author’s subtitle as its lede and the current canon', () => {
    for (const item of LIVE) {
      expect(item.summary, item.slug).toBeTruthy()
      expect(item.canon_version, item.slug).toBe('2026 current')
      expect(item.canon_status, item.slug).toBe('canonical')
    }
  })

  it('sub-chapters are filed under Individualism (chapter-05)', () => {
    for (const s of LIBRARY) {
      expect(s.type).toBe('sub_chapter')
      expect(s.collection).toBe('library')
      expect(s.parent).toBe('chapter-05')
      expect(s.related).toContain('chapter-05')
      expect(hrefFor(s)).toBe(`/library/${s.slug}/`)
    }
    expect(ART_OF_BEING.find((c) => c.slug === 'chapter-05')?.title).toBe('Individualism')
  })

  it('slugs agree with the public site configuration', () => {
    expect(ART_OF_BEING.filter((c) => c.type === 'chapter').map((c) => c.slug)).toEqual(CHAPTERS.map((c) => c.slug))
    expect(COMPANION.map((c) => c.slug)).toEqual(ARTICLES.map((a) => a.slug))
    expect(LIBRARY.map((c) => c.slug)).toEqual(SUB_CHAPTERS.map((s) => s.slug))
    for (const s of SUB_CHAPTERS) expect(LIBRARY.find((c) => c.slug === s.slug)?.parent).toBe(s.parent)
  })

  it('manuscript texts are carried verbatim, minus the repeated title and subtitle', () => {
    for (const item of LIVE) {
      const file = item.source!.match(/\((content\/manuscript\/[^)]+)\)/)![1]
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(item.body.startsWith('# '), item.slug).toBe(false)
      expect(src.includes(item.body), item.slug).toBe(true)
      expect(src, item.slug).toContain(`# ${item.title}`)
      expect(src, item.slug).toContain(`*${item.summary}*`)
    }
  })

  it('live texts carry no retired material', () => {
    // Retired by the handoff (04-DO-NOT.md): reading types as labels, booklets, 30-day programmes, the sixteen-chapter order.
    const retired = [/reading types?/i, /booklets?/i, /day \d+ of 30/i, /30-day/i, /discover your type/i, /Becomer, Resister, Doer/i, /chapter (1[3-6]|thirteen|fourteen|fifteen|sixteen)\b/i]
    for (const item of LIVE) for (const re of retired) expect(item.body, `${item.slug} ${re}`).not.toMatch(re)
  })

  it('live texts render as headed sections; chapters and articles close with the Boundary paragraph', () => {
    for (const item of LIVE) {
      const blocks = parseBlocks(item.body)
      expect(blocks.some((b) => b.kind === 'h2'), item.slug).toBe(true)
      // Horizontal rules and the dropped H1 never surface as text blocks.
      for (const b of blocks) if ('text' in b) expect(b.text, item.slug).not.toMatch(/^(---|# )/)
      if (item.collection === 'library') continue
      const boundary = blocks.find((b) => b.kind === 'p' && b.text.startsWith('**Boundary.**'))
      expect(boundary, item.slug).toBeDefined()
      const inline = parseInline((boundary as { text: string }).text)
      expect(inline[0]).toEqual({ kind: 'strong', text: 'Boundary.' })
    }
  })

  it('markdown: rules separate blocks and a Boundary heading is an ordinary heading', () => {
    expect(parseBlocks('One.\n\n---\n\nTwo.')).toEqual([
      { kind: 'p', text: 'One.' },
      { kind: 'p', text: 'Two.' },
    ])
    expect(parseBlocks('## Boundary\n\n**Boundary.** Not a duty.\n---')).toEqual([
      { kind: 'h2', text: 'Boundary' },
      { kind: 'p', text: '**Boundary.** Not a duty.' },
    ])
  })

  it('generated manuscript seeds match content/manuscript', async () => {
    const { render } = await import('../../scripts/manuscript.mts')
    expect(readFileSync(join(ROOT, 'content', 'seeds', 'manuscript.generated.ts'), 'utf8')).toBe(render())
  })

  it('slugs are unique across the corpus', () => {
    expect(new Set(SEED_CONTENT.map((c) => c.slug)).size).toBe(SEED_CONTENT.length)
  })

  it('glossary links in framework texts resolve', () => {
    for (const item of FRAMEWORK) {
      for (const b of parseBlocks(item.body)) {
        const texts = 'items' in b ? b.items : b.kind === 'code' ? [] : [b.text]
        for (const t of texts) for (const i of parseInline(t)) if (i.kind === 'term') expect(TERM_BY_SLUG.has(i.slug), `${item.slug}: ${i.slug}`).toBe(true)
      }
    }
  })

  it('related slugs point to real items', () => {
    const slugs = new Set(SEED_CONTENT.map((s) => s.slug))
    for (const item of SEED_CONTENT) for (const r of item.related) expect(slugs.has(r), `${item.slug} -> ${r}`).toBe(true)
    for (const item of FRAMEWORK) for (const c of item.concepts) expect(TERM_BY_SLUG.has(c), `${item.slug} concept ${c}`).toBe(true)
    for (const t of GLOSSARY) for (const s of t.see) expect(TERM_BY_SLUG.has(s), `${t.slug} see ${s}`).toBe(true)
  })
})

describe('Reader navigation', () => {
  it('walks previous / next within each live collection', () => {
    const live = published(SEED_CONTENT)
    const chapters = live.filter((c) => c.collection === 'art-of-being')
    expect(neighbours(chapters, 'chapter-01').prev).toBeUndefined()
    expect(neighbours(chapters, 'chapter-01').next?.slug).toBe('chapter-02')
    expect(neighbours(chapters, 'chapter-12').next).toBeUndefined()
    const articles = live.filter((c) => c.collection === 'companion')
    expect(neighbours(articles, 'the-neutral-gateway').next?.slug).toBe('your-business-evolves-around-others')
    const library = live.filter((c) => c.collection === 'library')
    expect(neighbours(library, 'other-peoples-material')).toMatchObject({ prev: undefined, next: { slug: 'coherence-in-business' } })
    expect(neighbours(library, 'coherence-in-business')).toMatchObject({ prev: { slug: 'other-peoples-material' }, next: undefined })
  })

  it('resolves hrefs per collection', () => {
    expect(hrefFor({ slug: 'chapter-05', collection: 'art-of-being' })).toBe('/library/art-of-being/chapter-05/')
    expect(hrefFor({ slug: 'the-aaa-method', collection: 'companion' })).toBe('/library/the-aaa-method/')
    expect(hrefFor({ slug: 'coherence-in-business', collection: 'library' })).toBe('/library/coherence-in-business/')
  })
})

describe('CMS lifecycle (§6.7)', () => {
  const at = '2026-10-01T00:00:00.000Z'
  const chapter = { ...ART_OF_BEING.find((c) => c.slug === 'appendix')! }
  const body = 'Being is Manifested; Becoming is Manufactured. '.repeat(12)

  it('enforces Draft → Review → Approved → Published', () => {
    expect(canTransition('draft', 'published')).toBe(false)
    expect(() => transition(chapter, 'published', at)).toThrow(LifecycleError)
  })

  it('refuses to publish an incomplete chapter even when approved', () => {
    const approved = transition(transition(chapter, 'review', at), 'approved', at)
    expect(() => transition(approved, 'published', at)).toThrow(/title without a body/)
  })

  it('publishes a complete chapter and keeps history on revision', () => {
    const drafted = revise(chapter, { body, change_note: 'Manuscript entered' }, at)
    const live = transition(transition(transition(drafted, 'review', at), 'approved', at), 'published', at)
    expect(isPubliclyVisible(live)).toBe(true)
    const revised = revise(live, { body: body + ' Revised passage.', change_note: 'Correction' }, '2026-10-02T00:00:00.000Z')
    expect(revised.content_version).toBe(2)
    expect(revised.history).toHaveLength(1)
    expect(revised.history[0].body).toBe(body)
    // While the revision is in draft, readers still see the published text.
    expect(readable(revised)?.body).toBe(body)
    expect(published(mergeContent(SEED_CONTENT, [revised])).find((c) => c.slug === 'appendix')?.content_version).toBe(1)
  })
})

describe('Audio / text identity (§6.3)', () => {
  const content = { id: 'c1', content_version: 2 }
  const asset = { content_id: 'c1', text_version: 1, audio_version: 1, voice: 'Narrator', duration: 300, audio_url: '/a.mp3' }

  it('plays recorded narration only for the current text version', () => {
    expect(resolveNarration(content, [{ ...asset, text_version: 2 }], false).kind).toBe('recorded')
  })
  it('marks narration of an earlier text version as stale', () => {
    expect(resolveNarration(content, [asset], false).kind).toBe('stale')
  })
  it('falls back to device narration of the current text', () => {
    expect(resolveNarration(content, [asset], true).kind).toBe('device')
  })
})

describe('Entitlements (§9.3)', () => {
  it('maps plans to capability flags with wildcards', () => {
    const open = flagsForPlan('open')
    expect(can(open, 'observe.basic')).toBe(true)
    expect(can(new Set(['library.full']), 'observe.basic')).toBe(false)
    expect(can(flagsForPlan('nonexistent'), 'library.full')).toBe(false)
  })
})

describe('Remote overlay', () => {
  it('keeps seed metadata when the remote row lacks it', () => {
    const seed = LIBRARY[0]
    const remote = { ...seed, related: [], concepts: [], source: undefined, body: seed.body + ' Revised in the CMS.', content_version: 2 }
    const merged = mergeContent(SEED_CONTENT, [remote]).find((c) => c.slug === seed.slug)!
    expect(merged.body).toContain('Revised in the CMS.')
    expect(merged.related).toEqual(seed.related)
    expect(merged.source).toBe(seed.source)
    expect(merged.parent).toBe('chapter-05')
  })
})
