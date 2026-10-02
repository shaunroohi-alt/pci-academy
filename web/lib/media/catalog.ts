// Visual material: recorded seminars, online courses, lectures and visual essays.
//
// To publish a recording, set `video` to a YouTube or Vimeo link (or a direct
// .mp4 URL) and change `status` to 'available'. Entries without a video show
// as forthcoming. `poster` is optional; without one, a geometric poster is
// drawn from the PCI mark.

export const MEDIA_KINDS = ['seminar', 'course', 'lecture', 'visual-essay'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export const MEDIA_KIND_META: Record<MediaKind, { label: string; plural: string; note: string }> = {
  seminar: { label: 'Seminar', plural: 'Recorded seminars', note: 'Full recordings of PCI Academy seminars and gatherings.' },
  course: { label: 'Online course', plural: 'Online courses', note: 'Video courses taught in sequence, with readings from the Library.' },
  lecture: { label: 'Lecture', plural: 'Lectures and talks', note: 'Single talks on one part of the framework.' },
  'visual-essay': { label: 'Visual essay', plural: 'Visual essays', note: 'Short films and diagrams that show a principle rather than explain it.' },
}

export type MediaItem = {
  slug: string
  kind: MediaKind
  title: string
  summary: string
  /** e.g. "1 h 20 min" or "6 sessions" */
  length?: string
  /** ISO date the recording was made or released */
  date?: string
  presenter?: string
  /** YouTube, Vimeo or direct video URL */
  video?: string
  poster?: string
  /** Related Library or Academy path, e.g. "/library/what-pci-is/" */
  related?: { label: string; href: string }
  status: 'available' | 'forthcoming'
}

export const MEDIA: readonly MediaItem[] = [
  {
    slug: 'introduction-to-pci',
    kind: 'lecture',
    title: 'An introduction to Psycho-Creative Intelligence',
    summary: 'What PCI does, what it does not do, and why the engine stops at observation.',
    length: '45 min',
    related: { label: 'Read what PCI is', href: '/library/what-pci-is/' },
    status: 'forthcoming',
  },
  {
    slug: 'seven-operations-seminar',
    kind: 'seminar',
    title: 'The seven operations, in practice',
    summary: 'A recorded seminar working through the seven questions on material brought by participants.',
    length: '1 h 30 min',
    related: { label: 'Read the principles', href: '/library/seven-operations/' },
    status: 'forthcoming',
  },
  {
    slug: 'foundations-course',
    kind: 'course',
    title: 'The Art of Being: Foundations',
    summary: 'The video course that accompanies the book, released chapter by chapter as each is approved.',
    length: 'Sessions released in sequence',
    related: { label: 'Open the Academy', href: '/academy/' },
    status: 'forthcoming',
  },
  {
    slug: 'event-and-meaning',
    kind: 'visual-essay',
    title: 'Event and meaning',
    summary: 'A short visual essay on separating what occurred from what it was taken to mean.',
    length: '8 min',
    status: 'forthcoming',
  },
  {
    slug: 'on-the-contrary-seminar',
    kind: 'seminar',
    title: 'On the Contrary: reading an error in its system',
    summary: 'How to examine an apparent error inside the wider system it belongs to, without forcing a positive reading.',
    length: '1 h 15 min',
    related: { label: 'Open On the Contrary', href: '/contrary/' },
    status: 'forthcoming',
  },
  {
    slug: 'evidence-and-the-unknown',
    kind: 'lecture',
    title: 'Evidence, interpretation and the unknown',
    summary: 'The epistemic layers of a PCI report, and why "unknown" is a finding rather than a gap.',
    length: '40 min',
    status: 'forthcoming',
  },
]

export function mediaBySlug(slug: string) {
  return MEDIA.find((m) => m.slug === slug)
}

/** Turns a YouTube or Vimeo page link into its embed URL; returns null for direct files. */
export function embedUrl(video: string): string | null {
  try {
    const u = new URL(video)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop()
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (host === 'vimeo.com') return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean)[0]}`
    if (host === 'player.vimeo.com') return video
    return null
  } catch {
    return null
  }
}
