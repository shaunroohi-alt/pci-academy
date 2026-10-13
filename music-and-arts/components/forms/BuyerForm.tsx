'use client'

import { useActionState } from 'react'
import { submitBuyer, type FormState } from '@/app/actions'
import { Select, TextArea, TextField } from '@/components/Field'
import { FormError } from '@/components/FormError'
import { Honeypot } from '@/components/Honeypot'
import { SubmitButton } from '@/components/SubmitButton'
import { BUYER_PIANO_TYPES, TIMELINES } from '@/lib/options'

export function BuyerForm({ listingId, listingTitle }: { listingId?: string; listingTitle?: string }) {
  const [state, action] = useActionState<FormState, FormData>(submitBuyer, null)
  const v = state?.values ?? {}
  const e = state?.errors ?? {}
  return (
    <form action={action} className="relative space-y-6" noValidate>
      <Honeypot />
      <input type="hidden" name="listing_id" value={listingId ?? ''} />
      <FormError message={e.form} />
      {listingTitle && (
        <p className="rounded-lg bg-gold-soft px-4 py-3 text-sm text-gold-deep">
          You are enquiring about <strong>{listingTitle}</strong>.
        </p>
      )}
      <TextField name="buyer_name" label="Your name" required autoComplete="name" defaultValue={v.buyer_name} error={e.buyer_name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="email" label="Email" type="email" required autoComplete="email" defaultValue={v.email} error={e.email} />
        <TextField name="phone" label="Phone" type="tel" required autoComplete="tel" defaultValue={v.phone} error={e.phone} />
        <TextField name="city" label="City" autoComplete="address-level2" defaultValue={v.city} error={e.city} />
        <Select name="timeline" label="When are you looking to buy?" options={TIMELINES} defaultValue={v.timeline ?? 'browsing'} error={e.timeline} />
      </div>
      {!listingId && (
        <div className="grid gap-5 sm:grid-cols-3">
          <Select name="piano_type" label="Type of piano" options={BUYER_PIANO_TYPES} defaultValue={v.piano_type ?? 'any'} error={e.piano_type} />
          <TextField name="budget_min" label="Budget from (USD)" inputMode="decimal" placeholder="e.g. 1500" defaultValue={v.budget_min} error={e.budget_min} />
          <TextField name="budget_max" label="Budget up to (USD)" inputMode="decimal" placeholder="e.g. 6000" defaultValue={v.budget_max} error={e.budget_max} />
        </div>
      )}
      <TextArea name="notes" label={listingId ? 'Questions or notes' : 'What are you looking for?'} rows={3} placeholder={listingId ? 'Ask about delivery, viewing, condition…' : 'Brands you like, size constraints, for a child or an adult, room size…'} defaultValue={v.notes} error={e.notes} />
      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton pendingText="Sending…">{listingId ? "I'm interested" : 'Notify me about pianos'}</SubmitButton>
      </div>
    </form>
  )
}
