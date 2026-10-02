// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AskQuestions } from '@/components/pci/ask-questions'
import { questionsFromMaterial } from '@/lib/pci/questions'
import { validateText } from '@/lib/pci/validator'
import { SAMPLE } from '../e2e/helpers'

const DIRECTION = /\b(should|must|tonight|try to|practice|your type)\b/i

describe('questionsFromMaterial — the interest rule (04-DO-NOT)', () => {
  it('returns nothing for empty or whitespace material', () => {
    expect(questionsFromMaterial('')).toEqual([])
    expect(questionsFromMaterial('   \n\t ')).toEqual([])
  })

  it('yields at least three questions from the sample material, every one a question', () => {
    const qs = questionsFromMaterial(SAMPLE)
    expect(qs.length).toBeGreaterThanOrEqual(3)
    for (const q of qs) expect(q.text.endsWith('?'), q.text).toBe(true)
  })

  it('assigns no direction', () => {
    for (const q of questionsFromMaterial(SAMPLE)) {
      // The person's own words may contain "should"; the engine's may not.
      const engineSpeech = q.text.replace(/“[^”]*”/g, '')
      expect(engineSpeech, q.text).not.toMatch(DIRECTION)
    }
  })

  it('quotes the person’s words verbatim', () => {
    const qs = questionsFromMaterial(SAMPLE)
    const fromWords = qs.filter((q) => q.from.kind === 'material')
    expect(fromWords.length).toBeGreaterThan(0)
    for (const q of fromWords) {
      if (q.from.kind !== 'material') continue
      expect(SAMPLE.includes(q.from.quote), q.from.quote).toBe(true)
      expect(q.text.includes(`“${q.from.quote}”`), q.text).toBe(true)
    }
  })

  it('keeps a request for direction as material and looks before the choice', () => {
    const qs = questionsFromMaterial(SAMPLE)
    expect(qs.some((q) => q.from.kind === 'material' && q.from.quote === 'What should I do' && /before one is chosen\?$/.test(q.text))).toBe(true)
  })

  it('is deterministic', () => {
    expect(questionsFromMaterial(SAMPLE)).toEqual(questionsFromMaterial(SAMPLE))
    expect(questionsFromMaterial(SAMPLE, { max: 4 })).toEqual(questionsFromMaterial(SAMPLE, { max: 4 }))
  })

  it('respects max, with a default of seven', () => {
    expect(questionsFromMaterial(SAMPLE).length).toBeLessThanOrEqual(7)
    expect(questionsFromMaterial(SAMPLE, { max: 2 })).toHaveLength(2)
    expect(questionsFromMaterial(SAMPLE, { max: 1 })).toHaveLength(1)
    expect(questionsFromMaterial(SAMPLE, { max: 0 })).toEqual([])
  })

  it('does not repeat a question', () => {
    const texts = questionsFromMaterial(`${SAMPLE} ${SAMPLE}`).map((q) => q.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('draws a question from the live corpus when the material names balance or the scale', () => {
    const qs = questionsFromMaterial('I keep trying to find balance between work and home. The scale tips one way every week and I weigh it again.')
    const fromText = qs.filter((q) => q.from.kind === 'text')
    expect(fromText.length).toBeGreaterThanOrEqual(1)
    expect(fromText.some((q) => q.from.kind === 'text' && q.from.slug === 'chapter-06')).toBe(true)
    expect(fromText.length).toBeLessThanOrEqual(2)
  })

  it('draws a question from the live corpus when the material names repetition or practice', () => {
    const qs = questionsFromMaterial('I practised the same passage for three hours. The repetition felt identical each time, but I was not the same by the end.')
    const slugs = qs.filter((q) => q.from.kind === 'text').map((q) => (q.from.kind === 'text' ? q.from.slug : ''))
    expect(slugs.length).toBeGreaterThanOrEqual(1)
    expect(slugs.some((s) => s === 'chapter-02' || s === 'chapter-12')).toBe(true)
  })

  it('every question passes the constitutional validator', () => {
    const materials = [
      SAMPLE,
      'I keep trying to find balance between work and home. The scale tips one way every week.',
      'I practised the same passage for three hours. The repetition felt identical each time.',
      'He is a narcissist and I am too sensitive. Everyone always leaves. What type am I?',
      'The meeting ran long. Nobody spoke. I went home.',
    ]
    for (const m of materials) {
      for (const q of questionsFromMaterial(m)) {
        const r = validateText(q.text, m)
        expect(r.ok, `${q.text}\n${JSON.stringify(r.violations)}`).toBe(true)
      }
    }
  })

  it('corpus questions name the text they come from', () => {
    for (const q of questionsFromMaterial('I keep trying to find balance between work and home.')) {
      if (q.from.kind !== 'text') continue
      expect(q.from.collection).toMatch(/^(art-of-being|companion|library)$/)
      expect(q.from.title.length).toBeGreaterThan(0)
    }
  })
})

describe('AskQuestions — nothing until asked', () => {
  afterEach(cleanup)

  it('renders only the request button before the click', () => {
    render(React.createElement(AskQuestions, { material: SAMPLE }))
    const button = screen.getByRole('button', { name: 'Ask me questions from this material' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Questions from this material' })).toBeNull()
    expect(screen.queryByText('PCI observes. PCI reports. Then PCI stops.')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('shows the questions, the closing line and a Close button after the click, and hides them again on Close', () => {
    render(React.createElement(AskQuestions, { material: SAMPLE }))
    const button = screen.getByRole('button', { name: 'Ask me questions from this material' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const region = screen.getByRole('region', { name: 'Questions from this material' })
    expect(region).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(questionsFromMaterial(SAMPLE).length)
    expect(screen.getByText('PCI observes. PCI reports. Then PCI stops.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Questions from this material' })).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('is disabled for blank material', () => {
    render(React.createElement(AskQuestions, { material: '   ' }))
    const button = screen.getByRole('button', { name: 'Ask me questions from this material' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('says so when nothing produced a question', () => {
    render(React.createElement(AskQuestions, { material: '…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask me questions from this material' }))
    expect(screen.getByText('Nothing in this material produced a question.')).toBeTruthy()
  })
})
