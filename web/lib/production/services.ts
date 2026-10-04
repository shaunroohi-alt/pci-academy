// Studio services listed on /production.
//
// To add a service, append an entry to the right category's `services` list.
// To add a category, append to PRODUCTION_CATEGORIES. Each price line is shown
// exactly as written, so keep the amounts as PCI Academy quotes them.

/** Where enquiries are addressed. The enquiry form opens the visitor's own mail app. */
export const PRODUCTION_CONTACT_EMAIL = 'bookings@pci.academy'

export type ProductionPrice = {
  /** e.g. "$120" or "From $550" */
  amount: string
  /** e.g. "per session" or "3 months · 12 sessions · total" */
  unit?: string
  /** Optional label when a service has several prices, e.g. "MP3 lease" */
  label?: string
}

export type ProductionService = {
  slug: string
  title: string
  summary?: string
  /** What the price covers, shown as a short list */
  includes?: string[]
  prices: ProductionPrice[]
}

export type ProductionCategory = {
  slug: string
  title: string
  note: string
  services: ProductionService[]
}

export const PRODUCTION_CATEGORIES: readonly ProductionCategory[] = [
  {
    slug: 'coaching',
    title: 'Coaching',
    note: 'One-to-one work on the voice, the artist and the craft of production.',
    services: [
      {
        slug: 'vocal-coaching',
        title: '1 on 1 Vocal Coaching',
        prices: [{ amount: '$120', unit: 'per session' }],
      },
      {
        slug: 'artist-coaching',
        title: '1 on 1 Artist Coaching',
        prices: [{ amount: '$3,500.00', unit: '3 months · 12 sessions · total' }],
      },
      {
        slug: 'music-production-coaching',
        title: '1 on 1 Music Production Coaching',
        prices: [{ amount: '$2,500.00', unit: '3 months · 12 sessions · total' }],
      },
    ],
  },
  {
    slug: 'engineering',
    title: 'Engineering',
    note: 'Recording, mixing and finishing, remote or in the room.',
    services: [
      {
        slug: 'audio-mix-engineering',
        title: 'Audio and Mix Engineering',
        prices: [{ amount: '$150', unit: 'per hour' }],
      },
      {
        slug: 'record-engineering',
        title: 'Record Engineering',
        prices: [
          { label: 'Remote', amount: '$30', unit: 'per hour' },
          { label: 'In person', amount: '$65', unit: 'per hour' },
        ],
      },
      {
        slug: 'co-engineering',
        title: 'Co-Engineering',
        includes: ['Post-production', 'Final mixing and mastering', '2 revisions'],
        prices: [{ amount: 'From $550.00', unit: 'per project' }],
      },
    ],
  },
  {
    slug: 'production',
    title: 'Production',
    note: 'Beats ready to lease, custom beats, and production shared from arrangement to master.',
    services: [
      {
        slug: 'beats-for-sale',
        title: 'Beats for Sale',
        prices: [
          { label: 'MP3 lease', amount: '$45' },
          { label: 'Lease with stems', amount: '$150' },
          { label: 'Custom made beat', amount: 'From $550', unit: 'per project' },
        ],
      },
      {
        slug: 'co-production',
        title: 'Co-Production',
        includes: ['Sound design', 'Post-arrangement', 'Post-production', 'Standard mix and mastering'],
        prices: [{ amount: 'From $550', unit: 'per project' }],
      },
    ],
  },
]

export const PRODUCTION_SERVICES = PRODUCTION_CATEGORIES.flatMap((c) => c.services.map((s) => ({ ...s, category: c.title })))

/** Builds the mailto: link the enquiry form opens. */
export function enquiryMailto(e: { service?: string; name: string; email: string; message: string }, to = PRODUCTION_CONTACT_EMAIL) {
  const subject = `Enquiry: ${e.service || 'Production services'}`
  const body = [`Name: ${e.name}`, `Email: ${e.email}`, e.service ? `Service: ${e.service}` : null, '', e.message].filter((l) => l !== null).join('\n')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
