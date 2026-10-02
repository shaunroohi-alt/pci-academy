// Site configuration from the PCI website handoff (content/handoff/site-config.json
// and 02-PAGES-AND-COPY.md). This is the only source of truth for the public
// site's names, navigation, chapter list, article list and closing lines.
// Do not add chapters, types, practices or calls to action that are not here.

export const SITE = {
  name: 'PCI',
  longName: 'Psycho-Creative Intelligence',
  book: 'The Art of Being',
  line: 'Perform who you are.',
  close: 'PCI observes. PCI reports. Then PCI stops.',
  disclaimer: 'Education, not therapy. Not medical, clinical, or crisis care.',
  footerDisclaimer: 'Education, not therapy.',
  libraryEnding: 'This text may be read. It is not a duty.',
  loop: 'Analyze, reflect, stop',
  url: 'https://pci.academy',
} as const

export const PALETTE = {
  paper: '#F7F3EA',
  ink: '#2A2723',
  muted: '#6B6558',
  gold: '#8A7344',
  rule: '#C8C2B4',
  dark: '#1C1916',
} as const

/** Global nav, in order. Enter is a quiet link, not a nav item. */
export const NAV = [
  { href: '/art-of-being/', label: 'Art of Being' },
  { href: '/library/', label: 'Library' },
  { href: '/method/', label: 'Method' },
  { href: '/academy/', label: 'Academy' },
  { href: '/practitioners/', label: 'Practitioners' },
  { href: '/boundary/', label: 'Boundary' },
] as const

export const ENTER = { href: '/enter/', label: 'Enter' } as const

/** The seven operations, as worded on the Method page. */
export const OPERATIONS = [
  { n: 1, name: 'Input', q: 'What is present, before it is explained?' },
  { n: 2, name: 'Decomposition', q: 'Event, behavior, interpretation, emotion, judgment, assumption, context, identity, unknown.' },
  { n: 3, name: 'Contextual comparison', q: 'Where has something like this appeared, and what was different?' },
  { n: 4, name: 'Pattern detection', q: 'What repeats, and under what conditions?' },
  { n: 5, name: 'Contradiction detection', q: 'What does not agree with itself?' },
  { n: 6, name: 'Evidentiary separation', q: 'Evidenced, inferred, symbolic, unknown.' },
  { n: 7, name: 'Observational report', q: 'What can be seen without deciding what to become or do?' },
] as const

/** Chapter list: short title and one line only (02-PAGES-AND-COPY.md). Slugs match the Library seeds. */
export const CHAPTERS = [
  { n: 1, slug: 'chapter-01', title: 'Discover Your Hidden Abilities', line: 'Recognition comes before refinement.' },
  { n: 2, slug: 'chapter-02', title: 'Practice as a Mythology', line: 'Performance is the default state.' },
  { n: 3, slug: 'chapter-03', title: 'You Were Finished at Birth', line: 'Eligibility was settled on arrival.' },
  { n: 4, slug: 'chapter-04', title: 'Darkness Is an Opportunity to Shine', line: 'What is unnamed still runs the day.' },
  { n: 5, slug: 'chapter-05', title: 'Individualism', line: 'Authorship, not isolation.' },
  { n: 6, slug: 'chapter-06', title: 'The Principle of Balance', line: 'The scale reports the weights it carries.' },
  { n: 7, slug: 'chapter-07', title: 'Identity — The Field of Possibilities', line: 'A name is not the field.' },
  { n: 8, slug: 'chapter-08', title: 'Growth Is Effortless', line: 'Effort proves expenditure, not growth.' },
  { n: 9, slug: 'chapter-09', title: 'You Are Bound to Choose', line: 'There is no seat outside your own life.' },
  { n: 10, slug: 'chapter-10', title: 'The Observer Gets Observed', line: 'The watcher is in the room.' },
  { n: 11, slug: 'chapter-11', title: 'The Illusion of Challenge', line: 'A problem is not an event. An emotion is not an identity.' },
  { n: 12, slug: 'chapter-12', title: 'Repetition Is Not Repetition', line: 'The file can be identical. The listener is not.' },
] as const

/** Companion articles: letter, title, one line. Slugs match the Library seeds. */
export const ARTICLES = [
  { letter: 'A', slug: 'the-aaa-method', title: 'The AAA Method', line: 'Adopt, Allow, Align. A description, not three software steps.' },
  { letter: 'B', slug: 'to-sing-is-to-breathe', title: 'To Sing Is to Breathe; To Breathe Is to Be', line: 'Technique is manufactured. The person who sings is not.' },
  { letter: 'C', slug: 'being-is-becoming', title: 'Being Is Becoming', line: 'Being is manifested. Becoming is manufactured.' },
  { letter: 'D', slug: 'the-neutral-gateway', title: 'The Neutral Gateway', line: 'Neutral means readable, not acceptable.' },
  { letter: 'E', slug: 'your-business-evolves-around-others', title: 'YOUR “BUSINESS” EVOLVES AROUND OTHERS', line: 'On urgency, coherence, and the awareness that protects nothing.' },
] as const

/** Sub-chapters, filed under Individualism. Slugs match the Library seeds. */
export const SUB_CHAPTERS = [
  { slug: 'other-peoples-material', title: 'Other People’s Material', parent: 'chapter-05', parentTitle: 'Individualism' },
  { slug: 'coherence-in-business', title: 'Coherence in Business', parent: 'chapter-05', parentTitle: 'Individualism' },
] as const

/** Member tools, named only. */
export const MEMBER_TOOLS = [
  { href: '/observe/', label: 'Observe' },
  { href: '/journal/', label: 'Journal' },
  { href: '/contrary/', label: 'On the Contrary' },
  { href: '/library/', label: 'Library' },
] as const

export const BOUNDARY_LIST = [
  'Not therapy, diagnosis, or crisis care',
  'Not a personality test',
  'Not a promise of healing, income, or arrival',
  'Not an order to withdraw from other people',
  'Not permission to finish someone else’s movement',
] as const
