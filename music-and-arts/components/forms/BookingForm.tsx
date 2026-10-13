'use client'

import { useActionState } from 'react'
import { submitBooking, type FormState } from '@/app/actions'
import { Select, TextArea, TextField } from '@/components/Field'
import { FormError } from '@/components/FormError'
import { Honeypot } from '@/components/Honeypot'
import { SubmitButton } from '@/components/SubmitButton'
import { formatCents } from '@/lib/format'
import { PIANO_TYPES, TIME_WINDOWS } from '@/lib/options'

type ServiceOption = { slug: string; name: string; price_cents: number | null; price_note: string }

export function BookingForm({ services, initialService }: { services: ServiceOption[]; initialService?: string }) {
  const [state, action] = useActionState<FormState, FormData>(submitBooking, null)
  const v = state?.values ?? {}
  const e = state?.errors ?? {}
  const today = new Date().toISOString().slice(0, 10)
  const serviceOptions = services.map((s) => ({
    value: s.slug,
    label: `${s.name} — ${s.price_cents == null ? s.price_note || 'price to be announced' : formatCents(s.price_cents)}`,
  }))

  return (
    <form action={action} className="relative space-y-8" noValidate>
      <Honeypot />
      <FormError message={e.form} />

      <fieldset className="space-y-5">
        <legend className="eyebrow">Service</legend>
        <Select name="service_slug" label="What do you need?" required options={serviceOptions} placeholder="Choose a service" defaultValue={v.service_slug ?? initialService} error={e.service_slug} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="preferred_date" label="Preferred date" type="date" min={today} defaultValue={v.preferred_date} error={e.preferred_date} help="Optional. We confirm the exact time with you." />
          <Select name="preferred_window" label="Preferred time" options={TIME_WINDOWS} defaultValue={v.preferred_window ?? 'flexible'} error={e.preferred_window} />
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="eyebrow">Your piano</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select name="piano_type" label="Piano type" required options={PIANO_TYPES} placeholder="Choose a type" defaultValue={v.piano_type} error={e.piano_type} />
          <TextField name="piano_brand" label="Brand and model" placeholder="e.g. Yamaha U1" defaultValue={v.piano_brand} error={e.piano_brand} />
        </div>
        <TextArea name="piano_notes" label="Anything we should know about the piano?" rows={3} placeholder="When it was last tuned, sticking keys, buzzing, moved recently…" defaultValue={v.piano_notes} error={e.piano_notes} />
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="eyebrow">Contact and address</legend>
        <TextField name="customer_name" label="Your name" required autoComplete="name" defaultValue={v.customer_name} error={e.customer_name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="email" label="Email" type="email" required autoComplete="email" inputMode="email" defaultValue={v.email} error={e.email} />
          <TextField name="phone" label="Phone" type="tel" required autoComplete="tel" inputMode="tel" defaultValue={v.phone} error={e.phone} />
        </div>
        <TextField name="address_line" label="Street address" required autoComplete="street-address" defaultValue={v.address_line} error={e.address_line} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="city" label="City" required autoComplete="address-level2" defaultValue={v.city} error={e.city} />
          <TextField name="postal_code" label="ZIP / postal code" autoComplete="postal-code" defaultValue={v.postal_code} error={e.postal_code} />
        </div>
        <TextArea name="notes" label="Notes" rows={3} placeholder="Parking, stairs, pets, best way to reach you…" defaultValue={v.notes} error={e.notes} />
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">No payment is taken online. We confirm your appointment by phone or email.</p>
        <SubmitButton pendingText="Sending request…">Request appointment</SubmitButton>
      </div>
    </form>
  )
}
