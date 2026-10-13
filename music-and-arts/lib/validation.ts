import { z } from 'zod'
import {
  BUYER_PIANO_TYPES,
  CONDITIONS,
  EXPERIENCE,
  LESSON_FORMATS,
  PIANO_TYPES,
  TIMELINES,
  TIME_WINDOWS,
  values,
} from './options'

const trimmed = (max: number) => z.string().trim().max(max)
const required = (label: string, max = 200) => trimmed(max).min(1, `${label} is required`)
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)
const phone = z
  .string()
  .trim()
  .min(7, 'Enter a phone number we can reach you on')
  .max(30)
  .regex(/^[0-9+()\-.\s]+$/, 'Enter a valid phone number')
const optionalText = (max: number) => trimmed(max).default('')
const money = z
  .string()
  .trim()
  .default('')
  .transform((v) => v.replace(/[^0-9.]/g, ''))
  .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 10_000_000), 'Enter a valid amount')

export const bookingSchema = z.object({
  service_slug: required('Service', 60),
  customer_name: required('Your name'),
  email,
  phone,
  address_line: required('Street address', 300),
  city: required('City', 120),
  postal_code: optionalText(20),
  piano_type: z.enum(values(PIANO_TYPES), { message: 'Choose a piano type' }),
  piano_brand: optionalText(120),
  piano_notes: optionalText(1000),
  preferred_date: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date')
    .refine((v) => v === '' || new Date(`${v}T23:59:59`) >= new Date(new Date().toDateString()), 'Pick a date from today onwards'),
  preferred_window: z.enum(values(TIME_WINDOWS)).default('flexible'),
  notes: optionalText(2000),
})
export type BookingInput = z.infer<typeof bookingSchema>

export const sellSchema = z.object({
  seller_name: required('Your name'),
  email,
  phone,
  city: required('City', 120),
  piano_type: z.enum(values(PIANO_TYPES), { message: 'Choose a piano type' }),
  brand: optionalText(120),
  model: optionalText(120),
  year_made: optionalText(20),
  serial_number: optionalText(60),
  condition: z.enum(values(CONDITIONS)).default('unknown'),
  description: optionalText(3000),
  photo_urls: z
    .string()
    .trim()
    .default('')
    .transform((v) => v.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean))
    .refine((urls) => urls.every((u) => /^https?:\/\//i.test(u)), 'Photo links must start with http:// or https://')
    .refine((urls) => urls.length <= 10, 'Up to 10 photo links'),
  asking_price: money,
})
export type SellInput = z.infer<typeof sellSchema>

export const buyerSchema = z.object({
  listing_id: z.string().uuid().optional().or(z.literal('')).default(''),
  buyer_name: required('Your name'),
  email,
  phone,
  city: optionalText(120),
  piano_type: z.enum(values(BUYER_PIANO_TYPES)).default('any'),
  budget_min: money,
  budget_max: money,
  timeline: z.enum(values(TIMELINES)).default('browsing'),
  notes: optionalText(2000),
})
export type BuyerInput = z.infer<typeof buyerSchema>

export const enrollSchema = z.object({
  parent_name: required('Parent or guardian name'),
  email,
  phone,
  student_name: required("Student's name"),
  student_age: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) >= 3 && Number(v) <= 99), 'Enter an age between 3 and 99'),
  program_slug: required('Program', 60),
  package_slug: optionalText(60),
  experience: z.enum(values(EXPERIENCE)).default('beginner'),
  format: z.enum(values(LESSON_FORMATS)).default('in_person'),
  availability: optionalText(1000),
  notes: optionalText(2000),
})
export type EnrollInput = z.infer<typeof enrollSchema>

export type FieldErrors = Record<string, string>

export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

export function formToObject(fd: FormData) {
  const obj: Record<string, string> = {}
  for (const [k, v] of fd.entries()) if (typeof v === 'string') obj[k] = v
  return obj
}
