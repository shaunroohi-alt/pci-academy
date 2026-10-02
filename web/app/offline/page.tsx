import Link from 'next/link'

export const metadata = { title: 'Offline' }

export default function Offline() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="display text-[40px]">You are offline</h1>
      <p className="mt-4 text-ink-2">This page was not saved for offline use yet. The Journal, the Library and your saved reports work offline once visited.</p>
      <p className="mt-6">
        <Link href="/enter/" className="font-medium text-accent">
          Enter
        </Link>
      </p>
    </div>
  )
}
