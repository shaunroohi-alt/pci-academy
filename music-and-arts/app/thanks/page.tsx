import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Thank you', robots: { index: false } }

const COPY: Record<string, { title: string; body: string; next: Array<[string, string]> }> = {
  booking: {
    title: 'Your appointment request is in.',
    body: 'We will confirm a date and time by phone or email, usually within one business day. Keep your reference handy.',
    next: [['/piano-services', 'Back to piano services'], ['/lessons', 'Explore music lessons']],
  },
  sell: {
    title: 'Thanks, we have your piano details.',
    body: 'A technician will review the submission and come back with an offer or a request to see the instrument.',
    next: [['/pianos', 'See pianos for sale'], ['/', 'Back to home']],
  },
  buyer: {
    title: 'You are on the list.',
    body: 'We will be in touch about this piano or the next one that matches what you are looking for.',
    next: [['/pianos', 'Keep browsing pianos'], ['/piano-services', 'Piano services']],
  },
  lessons: {
    title: 'Thanks for your enquiry.',
    body: 'We will reply within one business day to arrange a trial lesson and answer any questions.',
    next: [['/lessons', 'Back to music lessons'], ['/', 'Back to home']],
  },
}

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ type?: string; ref?: string }> }) {
  const { type = 'booking', ref } = await searchParams
  const copy = COPY[type] ?? COPY.booking
  const safeRef = ref && /^[A-Z]{2}-[A-Z0-9]{4,8}$/.test(ref) ? ref : null
  return (
    <div className="container-x py-20">
      <div className="card mx-auto max-w-xl text-center">
        <span aria-hidden className="display mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-2xl text-success">✓</span>
        <h1 className="mt-5 text-3xl font-semibold">{copy.title}</h1>
        <p className="mt-3 text-muted">{copy.body}</p>
        {safeRef && (
          <p className="mt-6 inline-block rounded-lg bg-cream px-4 py-2 font-mono text-sm">
            Reference <strong>{safeRef}</strong>
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {copy.next.map(([href, label], i) => (
            <Link key={href} href={href} className={i === 0 ? 'btn-primary' : 'btn-outline'}>{label}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}
