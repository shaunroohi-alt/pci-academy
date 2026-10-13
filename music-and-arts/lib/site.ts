// Central place for the business identity. The name is a working name and will change:
// set NEXT_PUBLIC_SITE_NAME in the environment and every page follows.
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || 'Music and Arts',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  tagline: 'Piano care, piano trading and music lessons under one roof.',
  description:
    'Book a piano technician for tuning, regulation or a full service; sell us your piano or find one to buy; and enrol your child in classical piano, pop piano, music theory or songwriting lessons.',
}

export const nav = [
  { href: '/piano-services', label: 'Piano Services' },
  { href: '/pianos', label: 'Pianos for Sale' },
  { href: '/lessons', label: 'Music Lessons' },
] as const

export const QUOTE_FEE_CENTS = 3000
