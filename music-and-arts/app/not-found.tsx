import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-3xl font-semibold">That page is not here.</h1>
      <p className="mt-3 text-muted">It may have moved, or the piano has already been sold.</p>
      <Link href="/" className="btn-primary mt-8">Back to home</Link>
    </div>
  )
}
