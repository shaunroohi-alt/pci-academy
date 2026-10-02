const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number | null | undefined, fallback = 'Price to be announced') {
  if (cents == null) return fallback
  return cents % 100 === 0 ? usd.format(cents / 100) : usdCents.format(cents / 100)
}

export function dollarsToCents(input: string | null | undefined): number | null {
  if (input == null) return null
  const cleaned = input.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function centsToDollarsInput(cents: number | null | undefined) {
  return cents == null ? '' : (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function applyMarkup(buyPriceCents: number, markupPercent: number) {
  // Round up to the nearest $5 so list prices look intentional.
  const raw = buyPriceCents * (1 + markupPercent / 100)
  return Math.ceil(raw / 500) * 500
}
