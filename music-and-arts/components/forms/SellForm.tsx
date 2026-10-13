'use client'

import { useActionState } from 'react'
import { submitSell, type FormState } from '@/app/actions'
import { Select, TextArea, TextField } from '@/components/Field'
import { FormError } from '@/components/FormError'
import { Honeypot } from '@/components/Honeypot'
import { SubmitButton } from '@/components/SubmitButton'
import { CONDITIONS, PIANO_TYPES } from '@/lib/options'

export function SellForm() {
  const [state, action] = useActionState<FormState, FormData>(submitSell, null)
  const v = state?.values ?? {}
  const e = state?.errors ?? {}
  return (
    <form action={action} className="relative space-y-8" noValidate>
      <Honeypot />
      <FormError message={e.form} />
      <fieldset className="space-y-5">
        <legend className="eyebrow">The piano</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select name="piano_type" label="Piano type" required options={PIANO_TYPES} placeholder="Choose a type" defaultValue={v.piano_type} error={e.piano_type} />
          <Select name="condition" label="Condition" options={CONDITIONS} defaultValue={v.condition ?? 'unknown'} error={e.condition} />
          <TextField name="brand" label="Brand" placeholder="e.g. Kawai" defaultValue={v.brand} error={e.brand} />
          <TextField name="model" label="Model" placeholder="e.g. K-300" defaultValue={v.model} error={e.model} />
          <TextField name="year_made" label="Year (approx.)" placeholder="e.g. 1998" defaultValue={v.year_made} error={e.year_made} />
          <TextField name="serial_number" label="Serial number" help="Usually stamped on the plate inside. Helps us date the piano." defaultValue={v.serial_number} error={e.serial_number} />
        </div>
        <TextArea name="description" label="Tell us about it" rows={4} placeholder="History, how often it was tuned, any damage, why you are selling…" defaultValue={v.description} error={e.description} />
        <TextArea name="photo_urls" label="Photo links" rows={2} placeholder="Paste links to photos (Google Photos, Dropbox, iCloud…), one per line" help="Optional, but photos get you a faster and more accurate offer." defaultValue={v.photo_urls} error={e.photo_urls} />
        <TextField name="asking_price" label="Asking price (USD)" inputMode="decimal" placeholder="Leave blank for 'make me an offer'" defaultValue={v.asking_price} error={e.asking_price} />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="eyebrow">Your details</legend>
        <TextField name="seller_name" label="Your name" required autoComplete="name" defaultValue={v.seller_name} error={e.seller_name} />
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField name="email" label="Email" type="email" required autoComplete="email" defaultValue={v.email} error={e.email} />
          <TextField name="phone" label="Phone" type="tel" required autoComplete="tel" defaultValue={v.phone} error={e.phone} />
          <TextField name="city" label="City" required autoComplete="address-level2" defaultValue={v.city} error={e.city} />
        </div>
      </fieldset>
      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">We review every submission and come back with an offer or next steps.</p>
        <SubmitButton pendingText="Sending…">Get an offer</SubmitButton>
      </div>
    </form>
  )
}
