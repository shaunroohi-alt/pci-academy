'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

// Static export has no server redirects; old links are forwarded in the browser, keeping their query string.
export function Redirect({ to, query }: { to: string; query?: string }) {
  const router = useRouter()
  React.useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    if (query) for (const [k, v] of new URLSearchParams(query)) if (!search.has(k)) search.set(k, v)
    const qs = search.toString()
    router.replace(qs ? `${to}?${qs}` : to)
  }, [router, to, query])
  return null
}
