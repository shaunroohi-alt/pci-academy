import { describe, expect, it } from 'vitest'
import { enquiryMailto, PRODUCTION_CATEGORIES, PRODUCTION_SERVICES } from '@/lib/production/services'

describe('production services', () => {
  it('has unique slugs and at least one price per service', () => {
    const slugs = PRODUCTION_SERVICES.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of PRODUCTION_SERVICES) expect(s.prices.length).toBeGreaterThan(0)
    expect(PRODUCTION_CATEGORIES.map((c) => c.slug)).toEqual(['coaching', 'engineering', 'production'])
  })

  it('builds an encoded mailto link', () => {
    const url = enquiryMailto({ service: 'Co-Production', name: 'A & B', email: 'a@b.co', message: 'Hi?' }, 'x@y.z')
    expect(url.startsWith('mailto:x@y.z?subject=Enquiry%3A%20Co-Production&body=')).toBe(true)
    expect(decodeURIComponent(url.split('body=')[1])).toBe('Name: A & B\nEmail: a@b.co\nService: Co-Production\n\nHi?')
  })
})
