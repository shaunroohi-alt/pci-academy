'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label, Notice, Select, Textarea } from '@/components/ui/primitives'
import { enquiryMailto, PRODUCTION_CATEGORIES, PRODUCTION_CONTACT_EMAIL } from '@/lib/production/services'

const SELECT_EVENT = 'production:select-service'

/** Card button: picks the service in the enquiry form and scrolls to it. */
export function EnquireLink({ service }: { service: string }) {
  return (
    <a
      href="#enquire"
      className="inline-flex h-8 items-center rounded-[3px] border border-accent px-3 text-[13px] font-medium text-accent transition-colors hover:bg-accent-soft"
      onClick={() => window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: service }))}
    >
      Enquire
    </a>
  )
}

export function EnquiryForm() {
  const [service, setService] = React.useState('')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [sent, setSent] = React.useState(false)

  React.useEffect(() => {
    const onSelect = (e: Event) => setService((e as CustomEvent<string>).detail)
    window.addEventListener(SELECT_EVENT, onSelect)
    return () => window.removeEventListener(SELECT_EVENT, onSelect)
  }, [])

  return (
    <section id="enquire" className="scroll-mt-24 border-t border-brass pt-8" aria-labelledby="enquire-h">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 id="enquire-h" className="display text-[32px]">
            Enquire or book
          </h2>
          <p className="mt-3 text-[15px] text-ink-2">
            Tell us which service you want and a little about the project. Sending opens your mail app with the enquiry written out, addressed to{' '}
            <a className="text-accent underline underline-offset-4 hover:no-underline" href={`mailto:${PRODUCTION_CONTACT_EMAIL}`}>
              {PRODUCTION_CONTACT_EMAIL}
            </a>
            .
          </p>
          <p className="mt-3 text-[13px] text-muted">No payment is taken on this site. We confirm availability, dates and the fee directly.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            window.location.href = enquiryMailto({ service, name, email, message })
            setSent(true)
          }}
        >
          <div>
            <Label htmlFor="enq-service">Service</Label>
            <Select id="enq-service" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Not sure yet</option>
              {PRODUCTION_CATEGORIES.map((c) => (
                <optgroup key={c.slug} label={c.title}>
                  {c.services.map((s) => (
                    <option key={s.slug} value={s.title}>
                      {s.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="enq-name">Name</Label>
              <Input id="enq-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="enq-email">Email</Label>
              <Input id="enq-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="enq-message">About your project</Label>
            <Textarea id="enq-message" required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Genre, timeline, links to references, preferred dates" className="min-h-28 text-[14px]" />
          </div>
          <Button type="submit">Send enquiry</Button>
          {sent ? (
            <Notice tone="accent" className="mt-2">
              Your mail app should have opened with the enquiry. If it did not, write to {PRODUCTION_CONTACT_EMAIL} directly.
            </Notice>
          ) : null}
        </form>
      </div>
    </section>
  )
}
