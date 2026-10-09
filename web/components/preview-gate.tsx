'use client'

import * as React from 'react'

// Owner preview for sections whose content is still placeholder (Media, MP Audio).
// Visitors see the fallback. Opening any page with ?preview=1 turns preview on
// for this browser (a cookie, one year); ?preview=0 turns it off again. This is
// a convenience switch, not access control: nothing behind it is secret.

const COOKIE = 'pci_preview'
const EVENT = 'pci-preview-change'

function readPreview(): boolean {
  const param = new URLSearchParams(window.location.search).get('preview')
  if (param === '1' || param === '0') {
    document.cookie = param === '1' ? `${COOKIE}=1; path=/; max-age=31536000; samesite=lax` : `${COOKIE}=; path=/; max-age=0; samesite=lax`
  }
  return document.cookie.split('; ').includes(`${COOKIE}=1`)
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}

/** True when the owner preview is on. Always false during the static render. */
export function usePreview(): boolean {
  return React.useSyncExternalStore(subscribe, readPreview, () => false)
}

function turnOff() {
  document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`
  window.dispatchEvent(new Event(EVENT))
}

/** Renders `children` only in owner preview, `fallback` for everyone else. */
export function PreviewGate({ children, fallback = null, badge = false }: { children: React.ReactNode; fallback?: React.ReactNode; badge?: boolean }) {
  const on = usePreview()
  if (!on) return <>{fallback}</>
  return (
    <>
      {children}
      {badge ? (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-full border border-[#c9a04a]/60 bg-[#0e0d0b]/90 py-1.5 pl-4 pr-1.5 text-[12px] text-[#f3ead7] shadow-lg backdrop-blur">
          Preview: placeholder content is visible to you only
          <button type="button" onClick={turnOff} className="rounded-full bg-[#c9a04a]/20 px-3 py-1 font-medium text-[#e8c26f] hover:bg-[#c9a04a]/35">
            Turn off
          </button>
        </div>
      ) : null}
    </>
  )
}
