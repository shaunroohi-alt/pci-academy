// Plan -> Entitlements -> Feature Access (§9.3, §17). The interface asks for
// a capability flag, never a plan name. Server-side enforcement lives in
// public.has_entitlement() and the pci-analyze Edge Function.
import { ENTITLEMENT_FLAGS } from '@/lib/pci/canon'

export type Flag = (typeof ENTITLEMENT_FLAGS)[number] | `academy.course.${string}`

export const PLANS: Record<string, readonly string[]> = {
  // v1 ships without a paywall: every member holds every capability.
  open: ENTITLEMENT_FLAGS,
}

export function flagsForPlan(plan: string): Set<string> {
  return new Set(PLANS[plan] ?? [])
}

export function can(flags: Set<string>, flag: Flag | string): boolean {
  if (flags.has(flag)) return true
  for (const f of flags) if (f.endsWith('.*') && flag.startsWith(f.slice(0, -1))) return true
  return false
}
