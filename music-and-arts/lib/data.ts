import 'server-only'
import { query, queryOne } from './db'
import { makeRef } from './ref'
import type { BookingInput, BuyerInput, EnrollInput, SellInput } from './validation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Service = {
  slug: string
  name: string
  tagline: string
  description: string
  includes: string[]
  price_cents: number | null
  price_note: string
  duration_minutes: number | null
  is_active: boolean
  sort_order: number
}

export type Program = {
  slug: string
  name: string
  tagline: string
  description: string
  highlights: string[]
  age_range: string
  is_active: boolean
  sort_order: number
}

export type LessonPackage = {
  slug: string
  name: string
  description: string
  lessons_count: number
  lesson_minutes: number
  billing: 'monthly' | 'one_time'
  price_cents: number | null
  is_active: boolean
  sort_order: number
}

export type Appointment = {
  id: string
  ref: string
  service_slug: string
  service_name: string
  customer_name: string
  email: string
  phone: string
  address_line: string
  city: string
  postal_code: string
  piano_type: string
  piano_brand: string
  piano_notes: string
  preferred_date: string | null
  preferred_window: string
  notes: string
  status: string
  admin_notes: string
  created_at: string
}

export type Listing = {
  id: string
  ref: string
  seller_name: string
  email: string
  phone: string
  city: string
  piano_type: string
  brand: string
  model: string
  year_made: string
  serial_number: string
  condition: string
  description: string
  photo_urls: string[]
  asking_price_cents: number | null
  status: string
  public_title: string
  public_description: string
  buy_price_cents: number | null
  list_price_cents: number | null
  admin_notes: string
  created_at: string
  interest_count?: number
}

export type BuyerInterest = {
  id: string
  ref: string
  listing_id: string | null
  listing_title: string | null
  buyer_name: string
  email: string
  phone: string
  city: string
  piano_type: string
  budget_min_cents: number | null
  budget_max_cents: number | null
  timeline: string
  notes: string
  status: string
  admin_notes: string
  created_at: string
}

export type Deal = {
  id: string
  listing_id: string
  listing_title: string
  buyer_id: string | null
  buyer_name: string | null
  buy_price_cents: number
  markup_percent: string
  sale_price_cents: number
  status: string
  notes: string
  created_at: string
}

export type LessonInquiry = {
  id: string
  ref: string
  parent_name: string
  email: string
  phone: string
  student_name: string
  student_age: number | null
  program_slug: string
  program_name: string
  package_slug: string | null
  package_name: string | null
  experience: string
  format: string
  availability: string
  notes: string
  status: string
  admin_notes: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await queryOne<{ value: T }>('select value from settings where key = $1', [key])
  return row ? row.value : fallback
}

export async function setSetting(key: string, value: unknown) {
  await query(
    `insert into settings (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

export async function getMarkupPercent() {
  const v = await getSetting<number | string>('marketplace_markup_percent', 15)
  const n = Number(v)
  return Number.isFinite(n) ? n : 15
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export function listServices(activeOnly = true) {
  return query<Service>(`select * from services ${activeOnly ? 'where is_active' : ''} order by sort_order, name`)
}
export function getService(slug: string) {
  return queryOne<Service>('select * from services where slug = $1', [slug])
}
export function listPrograms(activeOnly = true) {
  return query<Program>(`select * from programs ${activeOnly ? 'where is_active' : ''} order by sort_order, name`)
}
export function getProgram(slug: string) {
  return queryOne<Program>('select * from programs where slug = $1', [slug])
}
export function listPackages(activeOnly = true) {
  return query<LessonPackage>(`select * from lesson_packages ${activeOnly ? 'where is_active' : ''} order by sort_order, name`)
}

export async function updateServicePrice(slug: string, priceCents: number | null, priceNote: string, isActive: boolean) {
  await query('update services set price_cents = $2, price_note = $3, is_active = $4 where slug = $1', [slug, priceCents, priceNote, isActive])
}
export async function updatePackagePrice(slug: string, priceCents: number | null, isActive: boolean) {
  await query('update lesson_packages set price_cents = $2, is_active = $3 where slug = $1', [slug, priceCents, isActive])
}

// ---------------------------------------------------------------------------
// Submissions (public)
// ---------------------------------------------------------------------------
export async function createAppointment(input: BookingInput) {
  const ref = makeRef('BK')
  await query(
    `insert into appointments (ref, service_slug, customer_name, email, phone, address_line, city, postal_code,
       piano_type, piano_brand, piano_notes, preferred_date, preferred_window, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      ref, input.service_slug, input.customer_name, input.email, input.phone, input.address_line, input.city,
      input.postal_code, input.piano_type, input.piano_brand, input.piano_notes,
      input.preferred_date || null, input.preferred_window, input.notes,
    ],
  )
  return ref
}

export async function createListing(input: SellInput, askingPriceCents: number | null) {
  const ref = makeRef('PS')
  await query(
    `insert into piano_listings (ref, seller_name, email, phone, city, piano_type, brand, model, year_made,
       serial_number, condition, description, photo_urls, asking_price_cents)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      ref, input.seller_name, input.email, input.phone, input.city, input.piano_type, input.brand, input.model,
      input.year_made, input.serial_number, input.condition, input.description, input.photo_urls, askingPriceCents,
    ],
  )
  return ref
}

export async function createBuyerInterest(input: BuyerInput, budgetMin: number | null, budgetMax: number | null) {
  const ref = makeRef('PB')
  await query(
    `insert into buyer_interests (ref, listing_id, buyer_name, email, phone, city, piano_type, budget_min_cents,
       budget_max_cents, timeline, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      ref, input.listing_id || null, input.buyer_name, input.email, input.phone, input.city, input.piano_type,
      budgetMin, budgetMax, input.timeline, input.notes,
    ],
  )
  return ref
}

export async function createLessonInquiry(input: EnrollInput) {
  const ref = makeRef('LS')
  await query(
    `insert into lesson_inquiries (ref, parent_name, email, phone, student_name, student_age, program_slug,
       package_slug, experience, format, availability, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      ref, input.parent_name, input.email, input.phone, input.student_name,
      input.student_age ? Number(input.student_age) : null, input.program_slug, input.package_slug || null,
      input.experience, input.format, input.availability, input.notes,
    ],
  )
  return ref
}

// ---------------------------------------------------------------------------
// Public marketplace
// ---------------------------------------------------------------------------
export function listPublicPianos() {
  return query<Listing>(
    `select * from piano_listings where status = 'listed' and list_price_cents is not null order by updated_at desc`,
  )
}
export function getPublicPiano(id: string) {
  return queryOne<Listing>(`select * from piano_listings where id = $1 and status = 'listed'`, [id])
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------
export function listAppointments(status?: string) {
  return query<Appointment>(
    `select a.*, s.name as service_name from appointments a join services s on s.slug = a.service_slug
     ${status ? 'where a.status = $1' : ''} order by a.created_at desc limit 500`,
    status ? [status] : [],
  )
}
export function listListings(status?: string) {
  return query<Listing>(
    `select l.*, (select count(*) from buyer_interests b where b.listing_id = l.id)::int as interest_count
     from piano_listings l ${status ? 'where l.status = $1' : ''} order by l.created_at desc limit 500`,
    status ? [status] : [],
  )
}
export function getListing(id: string) {
  return queryOne<Listing>('select * from piano_listings where id = $1', [id])
}
export function listBuyers(status?: string) {
  return query<BuyerInterest>(
    `select b.*, nullif(coalesce(nullif(l.public_title, ''), nullif(concat_ws(' ', l.brand, l.model), '')), '') as listing_title
     from buyer_interests b left join piano_listings l on l.id = b.listing_id
     ${status ? 'where b.status = $1' : ''} order by b.created_at desc limit 500`,
    status ? [status] : [],
  )
}
export function listBuyersForListing(listingId: string) {
  return query<BuyerInterest>(
    `select b.*, null::text as listing_title from buyer_interests b where b.listing_id = $1 order by b.created_at desc`,
    [listingId],
  )
}
export function listDeals() {
  return query<Deal>(
    `select d.*, coalesce(nullif(l.public_title, ''), nullif(concat_ws(' ', l.brand, l.model), ''), l.ref) as listing_title,
       b.buyer_name
     from deals d join piano_listings l on l.id = d.listing_id left join buyer_interests b on b.id = d.buyer_id
     order by d.created_at desc limit 500`,
  )
}
export function listInquiries(status?: string) {
  return query<LessonInquiry>(
    `select i.*, p.name as program_name, k.name as package_name
     from lesson_inquiries i join programs p on p.slug = i.program_slug left join lesson_packages k on k.slug = i.package_slug
     ${status ? 'where i.status = $1' : ''} order by i.created_at desc limit 500`,
    status ? [status] : [],
  )
}

export async function dashboardCounts() {
  const row = await queryOne<{
    appointments_open: number
    listings_new: number
    listings_listed: number
    buyers_new: number
    deals_open: number
    inquiries_new: number
  }>(`select
      (select count(*) from appointments where status in ('requested','confirmed'))::int as appointments_open,
      (select count(*) from piano_listings where status in ('new','reviewing'))::int as listings_new,
      (select count(*) from piano_listings where status = 'listed')::int as listings_listed,
      (select count(*) from buyer_interests where status = 'new')::int as buyers_new,
      (select count(*) from deals where status in ('proposed','agreed'))::int as deals_open,
      (select count(*) from lesson_inquiries where status = 'new')::int as inquiries_new`)
  return row!
}

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------
const TABLES = {
  appointments: 'appointments',
  piano_listings: 'piano_listings',
  buyer_interests: 'buyer_interests',
  deals: 'deals',
  lesson_inquiries: 'lesson_inquiries',
} as const
export type Table = keyof typeof TABLES

export async function updateStatus(table: Table, id: string, status: string, adminNotes?: string) {
  const t = TABLES[table]
  if (adminNotes === undefined || table === 'deals') {
    await query(`update ${t} set status = $2, updated_at = now() where id = $1`, [id, status])
  } else {
    await query(`update ${t} set status = $2, admin_notes = $3, updated_at = now() where id = $1`, [id, status, adminNotes])
  }
}

export async function updateListingPricing(
  id: string,
  fields: {
    status: string
    public_title: string
    public_description: string
    buy_price_cents: number | null
    list_price_cents: number | null
    admin_notes: string
  },
) {
  await query(
    `update piano_listings set status = $2, public_title = $3, public_description = $4, buy_price_cents = $5,
       list_price_cents = $6, admin_notes = $7, updated_at = now() where id = $1`,
    [id, fields.status, fields.public_title, fields.public_description, fields.buy_price_cents, fields.list_price_cents, fields.admin_notes],
  )
}

export async function createDeal(fields: {
  listing_id: string
  buyer_id: string | null
  buy_price_cents: number
  markup_percent: number
  sale_price_cents: number
  notes: string
}) {
  await query(
    `insert into deals (listing_id, buyer_id, buy_price_cents, markup_percent, sale_price_cents, notes)
     values ($1,$2,$3,$4,$5,$6)`,
    [fields.listing_id, fields.buyer_id, fields.buy_price_cents, fields.markup_percent, fields.sale_price_cents, fields.notes],
  )
  if (fields.buyer_id) {
    await query(`update buyer_interests set status = 'matched', updated_at = now() where id = $1 and status in ('new','contacted')`, [fields.buyer_id])
  }
}
