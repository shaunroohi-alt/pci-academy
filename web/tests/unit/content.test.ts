import { describe, expect, it } from 'vitest'
import { ART_OF_BEING } from '@/content/seeds/art-of-being'
import { COURSES } from '@/content/seeds/courses'
import { FRAMEWORK } from '@/content/seeds/framework'
import { GLOSSARY } from '@/content/seeds/glossary'
import { JOURNAL_PROMPTS, promptForDate } from '@/content/seeds/journal-prompts'
import { mergeContent, published, readable, SEED_CONTENT, TERM_BY_SLUG } from '@/lib/content/catalog'
import { canTransition, LifecycleError, revise, transition } from '@/lib/content/lifecycle'
import { parseBlocks, parseInline } from '@/lib/content/markdown'
import { isPubliclyVisible, validateForPublication } from '@/lib/content/validation'
import { resolveNarration } from '@/lib/audio/narration'
import { can, flagsForPlan } from '@/lib/entitlements'
import { validateText } from '@/lib/pci/validator'

describe('Publication validation (R0.4)', () => {
  it('every published seed item is complete', () => {
    for (const item of SEED_CONTENT.filter((i) => i.status === 'published')) {
      expect(validateForPublication(item), item.slug).toEqual({ ok: true, errors: [] })
    }
  })

  it('a title without a body fails', () => {
    const ch = ART_OF_BEING.find((c) => c.slug === 'chapter-01')!
    const r = validateForPublication(ch)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/title without a body/)
  })

  it('placeholder text fails', () => {
    const r = validateForPublication({ ...FRAMEWORK[0], body: FRAMEWORK[0].body + ' TBD' })
    expect(r.ok).toBe(false)
  })

  it('no Art of Being chapter is visible without its manuscript', () => {
    expect(ART_OF_BEING).toHaveLength(20)
    expect(ART_OF_BEING.filter((c) => c.type === 'chapter')).toHaveLength(16)
    expect(published(SEED_CONTENT).some((c) => c.collection === 'art-of-being')).toBe(false)
  })

  it('chapter order is correct', () => {
    const chapters = ART_OF_BEING.filter((c) => c.type === 'chapter')
    expect(chapters.map((c) => c.order)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    expect(chapters[2].title).toBe('Being Is Becoming')
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
    for (const item of FRAMEWORK) for (const r of item.related) expect(slugs.has(r), `${item.slug} -> ${r}`).toBe(true)
    for (const item of FRAMEWORK) for (const c of item.concepts) expect(TERM_BY_SLUG.has(c), `${item.slug} concept ${c}`).toBe(true)
    for (const t of GLOSSARY) for (const s of t.see) expect(TERM_BY_SLUG.has(s), `${t.slug} see ${s}`).toBe(true)
  })
})

describe('CMS lifecycle (§6.7)', () => {
  const at = '2026-10-01T00:00:00.000Z'
  const chapter = { ...ART_OF_BEING.find((c) => c.slug === 'chapter-03')! }
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
    expect(published(mergeContent(SEED_CONTENT, [revised])).find((c) => c.slug === 'chapter-03')?.content_version).toBe(1)
  })
})

describe('Journal prompt bank (§14)', () => {
  it('has at least 90 prompts, all mapped to a concept', () => {
    expect(JOURNAL_PROMPTS.length).toBeGreaterThanOrEqual(90)
    expect(new Set(JOURNAL_PROMPTS.map((p) => p.text)).size).toBe(JOURNAL_PROMPTS.length)
    for (const p of JOURNAL_PROMPTS) expect(p.concept).toBeTruthy()
  })

  it('carries the blueprint example as the only canonical prompt', () => {
    expect(JOURNAL_PROMPTS[0].canon_status).toBe('canonical')
    expect(JOURNAL_PROMPTS.slice(1).every((p) => p.canon_status === 'provisional')).toBe(true)
  })

  it('every prompt is observational (passes the constitutional validator)', () => {
    for (const p of JOURNAL_PROMPTS) expect(validateText(p.text).violations, p.text).toEqual([])
  })

  it('gives one subject per day, stable for the date', () => {
    expect(promptForDate('2026-09-25').id).toBe(promptForDate('2026-09-25').id)
    expect(promptForDate('2026-09-25').id).not.toBe(promptForDate('2026-09-26').id)
  })
})

describe('Academy (§6.1)', () => {
  it('reuses canonical Library content rather than duplicating it', () => {
    const slugs = new Set(FRAMEWORK.map((f) => f.slug))
    for (const c of COURSES) for (const l of c.lessons) for (const r of l.reading) expect(slugs.has(r.slug), `${c.slug}/${l.lesson_id} -> ${r.slug}`).toBe(true)
  })

  it('lesson journal prompts and exercises are observational', () => {
    for (const c of COURSES) for (const l of c.lessons) {
      expect(validateText(l.journal_prompt).violations).toEqual([])
      expect(validateText(l.orientation).violations).toEqual([])
    }
  })

  it('lesson objects carry the blueprint fields', () => {
    const l = COURSES[0].lessons[0]
    for (const k of ['lesson_id', 'title', 'related_chapters', 'related_concepts', 'journal_prompt', 'optional_observation', 'resources']) expect(l).toHaveProperty(k)
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
    expect(can(open, 'academy.course.pci-foundations')).toBe(true)
    expect(can(new Set(['library.full']), 'observe.basic')).toBe(false)
    expect(can(flagsForPlan('nonexistent'), 'library.full')).toBe(false)
  })
})

describe('Remote overlay', () => {
  it('keeps seed metadata when the remote row lacks it', () => {
    const seed = FRAMEWORK[0]
    const remote = { ...seed, related: [], concepts: [], source: undefined, body: seed.body + ' Revised in the CMS.', content_version: 2 }
    const merged = mergeContent(SEED_CONTENT, [remote]).find((c) => c.slug === seed.slug)!
    expect(merged.body).toContain('Revised in the CMS.')
    expect(merged.related).toEqual(seed.related)
    expect(merged.source).toBe(seed.source)
  })
})
