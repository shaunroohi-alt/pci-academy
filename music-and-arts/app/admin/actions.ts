'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkPassword, createSession, destroySession, requireAdmin } from '@/lib/admin-auth'
import {
  createDeal,
  getListing,
  listPackages,
  listServices,
  setSetting,
  updateListingPricing,
  updatePackagePrice,
  updateServicePrice,
  updateStatus,
  type Table,
} from '@/lib/data'
import { applyMarkup, dollarsToCents } from '@/lib/format'
import { APPOINTMENT_STATUSES, BUYER_STATUSES, DEAL_STATUSES, INQUIRY_STATUSES, LISTING_STATUSES } from '@/lib/options'

export type LoginState = { error?: string } | null

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '')
  if (!checkPassword(password)) return { error: 'Incorrect password.' }
  await createSession()
  redirect('/admin')
}

export async function logout() {
  await destroySession()
  redirect('/admin/login')
}

const STATUS_SETS: Record<Table, readonly string[]> = {
  appointments: APPOINTMENT_STATUSES,
  piano_listings: LISTING_STATUSES,
  buyer_interests: BUYER_STATUSES,
  deals: DEAL_STATUSES,
  lesson_inquiries: INQUIRY_STATUSES,
}

const PATHS: Record<Table, string> = {
  appointments: '/admin/appointments',
  piano_listings: '/admin/pianos',
  buyer_interests: '/admin/buyers',
  deals: '/admin/deals',
  lesson_inquiries: '/admin/lessons',
}

export async function setStatus(formData: FormData) {
  await requireAdmin()
  const table = String(formData.get('table')) as Table
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  const notes = formData.has('admin_notes') ? String(formData.get('admin_notes')).slice(0, 4000) : undefined
  if (!(table in STATUS_SETS) || !STATUS_SETS[table].includes(status) || !id) return
  await updateStatus(table, id, status, notes)
  revalidatePath(PATHS[table])
  revalidatePath('/admin')
  if (table === 'piano_listings') {
    revalidatePath(`/admin/pianos/${id}`)
    revalidatePath('/pianos')
  }
}

export type ListingState = { error?: string; saved?: boolean } | null

export async function saveListing(_prev: ListingState, formData: FormData): Promise<ListingState> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const listing = await getListing(id)
  if (!listing) return { error: 'Listing not found.' }
  const status = String(formData.get('status') ?? listing.status)
  if (!LISTING_STATUSES.includes(status as (typeof LISTING_STATUSES)[number])) return { error: 'Invalid status.' }
  const buy = dollarsToCents(String(formData.get('buy_price') ?? ''))
  let list = dollarsToCents(String(formData.get('list_price') ?? ''))
  const markup = Number(formData.get('markup_percent') ?? 0)
  if (list == null && buy != null && Number.isFinite(markup)) list = applyMarkup(buy, markup)
  if (status === 'listed' && list == null) return { error: 'A list price is needed before a piano can be listed.' }
  await updateListingPricing(id, {
    status,
    public_title: String(formData.get('public_title') ?? '').trim().slice(0, 200),
    public_description: String(formData.get('public_description') ?? '').trim().slice(0, 5000),
    buy_price_cents: buy,
    list_price_cents: list,
    admin_notes: String(formData.get('admin_notes') ?? '').trim().slice(0, 4000),
  })
  revalidatePath(`/admin/pianos/${id}`)
  revalidatePath('/admin/pianos')
  revalidatePath('/pianos')
  revalidatePath(`/pianos/${id}`)
  return { saved: true }
}

export async function makeDeal(formData: FormData) {
  await requireAdmin()
  const listingId = String(formData.get('listing_id') ?? '')
  const buyerId = String(formData.get('buyer_id') ?? '') || null
  const listing = await getListing(listingId)
  if (!listing) return
  const buy = dollarsToCents(String(formData.get('buy_price') ?? '')) ?? listing.buy_price_cents
  const markup = Number(formData.get('markup_percent'))
  if (buy == null || !Number.isFinite(markup) || markup < 0 || markup > 500) return
  const sale = dollarsToCents(String(formData.get('sale_price') ?? '')) ?? applyMarkup(buy, markup)
  await createDeal({
    listing_id: listingId,
    buyer_id: buyerId,
    buy_price_cents: buy,
    markup_percent: markup,
    sale_price_cents: sale,
    notes: String(formData.get('notes') ?? '').trim().slice(0, 4000),
  })
  revalidatePath(`/admin/pianos/${listingId}`)
  revalidatePath('/admin/deals')
  revalidatePath('/admin/buyers')
  revalidatePath('/admin')
  redirect('/admin/deals')
}

export type SettingsState = { saved?: boolean; error?: string } | null

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin()
  const markup = Number(formData.get('marketplace_markup_percent'))
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) return { error: 'Markup must be between 0 and 500 percent.' }
  await setSetting('marketplace_markup_percent', markup)
  await setSetting('service_area', String(formData.get('service_area') ?? '').trim().slice(0, 500))
  await setSetting('contact_email', String(formData.get('contact_email') ?? '').trim().slice(0, 200))
  await setSetting('contact_phone', String(formData.get('contact_phone') ?? '').trim().slice(0, 50))

  for (const s of await listServices(false)) {
    const price = dollarsToCents(String(formData.get(`service:${s.slug}:price`) ?? ''))
    const note = String(formData.get(`service:${s.slug}:note`) ?? '').trim().slice(0, 120)
    const active = formData.get(`service:${s.slug}:active`) === 'on'
    await updateServicePrice(s.slug, price, note, active)
  }
  for (const k of await listPackages(false)) {
    const price = dollarsToCents(String(formData.get(`package:${k.slug}:price`) ?? ''))
    const active = formData.get(`package:${k.slug}:active`) === 'on'
    await updatePackagePrice(k.slug, price, active)
  }
  for (const p of ['/', '/piano-services', '/piano-services/book', '/lessons', '/lessons/enroll', '/admin/settings']) revalidatePath(p)
  return { saved: true }
}
