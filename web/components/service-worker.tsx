'use client'

import * as React from 'react'

export function ServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {
      // Installability is progressive; the app works without the worker.
    })
  }, [])
  return null
}
