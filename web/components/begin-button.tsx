'use client'

import { LinkButton } from '@/components/ui/button'
import { useApp } from '@/lib/app/context'

export function BeginButton() {
  const { prefs, ready } = useApp()
  if (ready && prefs.onboarding_complete) {
    return (
      <LinkButton href="/today/" size="lg">
        Continue to Today
      </LinkButton>
    )
  }
  return (
    <LinkButton href="/onboarding/" size="lg">
      Begin
    </LinkButton>
  )
}
