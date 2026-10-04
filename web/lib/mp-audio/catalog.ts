// MP Audio storefront data. Everything here is a PLACEHOLDER until the real
// product list, prices and checkout provider are supplied: names, specs and
// prices are illustrative only, and `placeholder: true` keeps the UI labelling
// them as such. Replace an entry and set `placeholder: false` to publish it.

export type PluginKind = 'instrument' | 'mixing'

export type Plugin = {
  slug: string
  name: string
  kind: PluginKind
  category: string
  tagline: string
  features: string[]
  formats: string[]
  /** Hue (0–360) for the generated faceplate art. */
  hue: number
  /** Monthly subscription price for this one plugin, in USD. */
  monthly: number
  /** Rent-to-own: monthly payment and number of payments until it is owned. */
  rent: { monthly: number; payments: number }
  placeholder: boolean
}

export const FORMATS = ['VST3', 'AU', 'AAX']

export const PLUGINS: Plugin[] = [
  {
    slug: 'velvet-keys',
    name: 'Velvet Keys',
    kind: 'instrument',
    category: 'Electric piano',
    tagline: 'Tine and reed electric pianos with a warm amp stage.',
    features: ['Multi-velocity sampled tines', 'Tremolo, phaser and amp sim', 'Release and pedal noise control'],
    formats: FORMATS,
    hue: 28,
    monthly: 9.99,
    rent: { monthly: 14.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'nebula-pad',
    name: 'Nebula Pad',
    kind: 'instrument',
    category: 'Wavetable synth',
    tagline: 'Evolving pads and textures from a dual wavetable engine.',
    features: ['Two morphing wavetable oscillators', 'Macro-driven motion', '400 factory presets'],
    formats: FORMATS,
    hue: 268,
    monthly: 9.99,
    rent: { monthly: 14.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'iron-808',
    name: 'Iron 808',
    kind: 'instrument',
    category: 'Drum machine',
    tagline: 'Punchy drum kits with per-voice saturation and glide.',
    features: ['16-pad sampler with step sequencer', 'Pitch glide on every voice', 'Drag-and-drop MIDI patterns'],
    formats: FORMATS,
    hue: 4,
    monthly: 7.99,
    rent: { monthly: 11.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'string-theory',
    name: 'String Theory',
    kind: 'instrument',
    category: 'Orchestral strings',
    tagline: 'Section strings with legato, spiccato and long-note swells.',
    features: ['True legato transitions', 'Close, room and hall mics', 'Expression and vibrato on the mod wheel'],
    formats: FORMATS,
    hue: 200,
    monthly: 12.99,
    rent: { monthly: 19.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'glue-bus',
    name: 'Glue Bus',
    kind: 'mixing',
    category: 'Bus compressor',
    tagline: 'A VCA-style bus compressor that holds a mix together.',
    features: ['Classic ratio and attack steps', 'Sidechain high-pass filter', 'Parallel mix knob'],
    formats: FORMATS,
    hue: 160,
    monthly: 6.99,
    rent: { monthly: 9.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'true-tone-eq',
    name: 'True Tone EQ',
    kind: 'mixing',
    category: 'Equaliser',
    tagline: 'A clean, surgical EQ with dynamic bands and a live analyser.',
    features: ['24 bands, static or dynamic', 'Mid/side and linear phase', 'Spectrum match to a reference'],
    formats: FORMATS,
    hue: 188,
    monthly: 6.99,
    rent: { monthly: 9.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'halo-verb',
    name: 'Halo Verb',
    kind: 'mixing',
    category: 'Reverb',
    tagline: 'Halls, plates and shimmer spaces with built-in ducking.',
    features: ['Algorithmic halls, plates and rooms', 'Shimmer and freeze modes', 'Ducking so vocals stay clear'],
    formats: FORMATS,
    hue: 228,
    monthly: 6.99,
    rent: { monthly: 9.99, payments: 10 },
    placeholder: true,
  },
  {
    slug: 'clip-master',
    name: 'Clip Master',
    kind: 'mixing',
    category: 'Limiter',
    tagline: 'A transparent mastering limiter with loudness metering.',
    features: ['True-peak limiting', 'LUFS metering for streaming targets', 'Soft-clip stage before the limiter'],
    formats: FORMATS,
    hue: 42,
    monthly: 7.99,
    rent: { monthly: 11.99, payments: 10 },
    placeholder: true,
  },
]

export type PlanId = 'single' | 'rent' | 'bundle'

export type Plan = {
  id: PlanId
  name: string
  price: string
  cadence: string
  summary: string
  points: string[]
  featured?: boolean
}

const cheapest = Math.min(...PLUGINS.map((p) => p.monthly))
const cheapestRent = PLUGINS.reduce((a, p) => (p.rent.monthly < a.rent.monthly ? p : a))

export const BUNDLE_MONTHLY = 29.99

export const PLANS: Plan[] = [
  {
    id: 'single',
    name: 'Single plugin',
    price: `from ${usd(cheapest)}`,
    cadence: 'per plugin / month',
    summary: 'Subscribe to just the plugins you use. Cancel any month.',
    points: ['Pick any plugin from the catalogue', 'All updates included while subscribed', 'Cancel or switch plugins any month'],
  },
  {
    id: 'bundle',
    name: 'All-access bundle',
    price: usd(BUNDLE_MONTHLY),
    cadence: 'per month',
    summary: `Every MP Audio plugin in one subscription, ${PLUGINS.length} today and every new release.`,
    points: ['Every instrument and mixing plugin', 'New releases added automatically', 'One licence, all formats'],
    featured: true,
  },
  {
    id: 'rent',
    name: 'Rent-to-own',
    price: `from ${usd(cheapestRent.rent.monthly)}`,
    cadence: `per month × ${cheapestRent.rent.payments}`,
    summary: 'Pay monthly and the plugin is yours for good after the last payment.',
    points: ['Own the licence outright when paid off', 'Pause payments without losing progress', 'Updates included while renting'],
  },
]

export function usd(n: number) {
  return `$${n.toFixed(2)}`
}

export const pluginsOfKind = (kind: PluginKind) => PLUGINS.filter((p) => p.kind === kind)
