'use server'

import { redirect } from 'next/navigation'
import { createAppointment, createBuyerInterest, createLessonInquiry, createListing, getProgram, getPublicPiano, getService } from '@/lib/data'
import { dollarsToCents } from '@/lib/format'
import { bookingSchema, buyerSchema, enrollSchema, flattenErrors, formToObject, sellSchema, type FieldErrors } from '@/lib/validation'

export type FormState = { errors: FieldErrors; values: Record<string, string> } | null

function fail(errors: FieldErrors, values: Record<string, string>): FormState {
  return { errors, values }
}

/** Simple honeypot: bots fill every field, people never see this one. */
function isBot(values: Record<string, string>) {
  return Boolean(values.website)
}

export async function submitBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData)
  if (isBot(values)) redirect('/thanks?type=booking&ref=BK-0000')
  const parsed = bookingSchema.safeParse(values)
  if (!parsed.success) return fail(flattenErrors(parsed.error), values)
  const service = await getService(parsed.data.service_slug)
  if (!service || !service.is_active) return fail({ service_slug: 'Choose a service' }, values)
  let ref: string
  try {
    ref = await createAppointment(parsed.data)
  } catch (err) {
    console.error('booking failed', err)
    return fail({ form: 'Something went wrong saving your request. Please try again.' }, values)
  }
  redirect(`/thanks?type=booking&ref=${ref}`)
}

export async function submitSell(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData)
  if (isBot(values)) redirect('/thanks?type=sell&ref=PS-0000')
  const parsed = sellSchema.safeParse(values)
  if (!parsed.success) return fail(flattenErrors(parsed.error), values)
  let ref: string
  try {
    ref = await createListing(parsed.data, dollarsToCents(parsed.data.asking_price))
  } catch (err) {
    console.error('sell failed', err)
    return fail({ form: 'Something went wrong saving your piano. Please try again.' }, values)
  }
  redirect(`/thanks?type=sell&ref=${ref}`)
}

export async function submitBuyer(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData)
  if (isBot(values)) redirect('/thanks?type=buyer&ref=PB-0000')
  const parsed = buyerSchema.safeParse(values)
  if (!parsed.success) return fail(flattenErrors(parsed.error), values)
  if (parsed.data.listing_id) {
    const piano = await getPublicPiano(parsed.data.listing_id)
    if (!piano) return fail({ form: 'That piano is no longer available. Tell us what you are looking for instead.' }, values)
  }
  const min = dollarsToCents(parsed.data.budget_min)
  const max = dollarsToCents(parsed.data.budget_max)
  if (min != null && max != null && min > max) return fail({ budget_max: 'Maximum budget must be at least the minimum' }, values)
  let ref: string
  try {
    ref = await createBuyerInterest(parsed.data, min, max)
  } catch (err) {
    console.error('buyer failed', err)
    return fail({ form: 'Something went wrong saving your request. Please try again.' }, values)
  }
  redirect(`/thanks?type=buyer&ref=${ref}`)
}

export async function submitEnroll(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData)
  if (isBot(values)) redirect('/thanks?type=lessons&ref=LS-0000')
  const parsed = enrollSchema.safeParse(values)
  if (!parsed.success) return fail(flattenErrors(parsed.error), values)
  const program = await getProgram(parsed.data.program_slug)
  if (!program || !program.is_active) return fail({ program_slug: 'Choose a program' }, values)
  let ref: string
  try {
    ref = await createLessonInquiry(parsed.data)
  } catch (err) {
    console.error('enroll failed', err)
    return fail({ form: 'Something went wrong saving your enquiry. Please try again.' }, values)
  }
  redirect(`/thanks?type=lessons&ref=${ref}`)
}
