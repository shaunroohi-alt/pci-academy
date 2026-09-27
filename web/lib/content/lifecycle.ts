// CMS lifecycle (§6.7): Draft → Review → Approved → Published → Revised → Superseded.
// Mirrors public.valid_transition() in the database.
import { CANON_VERSION } from '@/lib/pci/canon'
import type { ContentItem, Lifecycle } from './types'
import { validateForPublication } from './validation'

export const TRANSITIONS: Record<Lifecycle, Lifecycle[]> = {
  draft: ['review'],
  review: ['draft', 'approved'],
  approved: ['review', 'published'],
  published: ['revised', 'superseded'],
  revised: ['review', 'superseded'],
  superseded: [],
}

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  draft: 'Draft',
  review: 'Review',
  approved: 'Approved',
  published: 'Published',
  revised: 'Revised',
  superseded: 'Superseded',
}

export function canTransition(from: Lifecycle, to: Lifecycle): boolean {
  return from === to || TRANSITIONS[from].includes(to)
}

export class LifecycleError extends Error {}

export function transition(item: ContentItem, to: Lifecycle, at: string): ContentItem {
  if (!canTransition(item.status, to)) throw new LifecycleError(`Cannot move from ${item.status} to ${to}.`)
  if (to === 'published') {
    const check = validateForPublication(item)
    if (!check.ok) throw new LifecycleError(check.errors.join(' '))
    return { ...item, status: to, published_at: item.published_at ?? at, updated_at: at }
  }
  return { ...item, status: to, updated_at: at }
}

/**
 * Revise content without erasing history. Once a text has been published,
 * a revision keeps the published text as a version record and opens a new
 * content version in Draft. Unpublished drafts are edited in place.
 */
export function revise(item: ContentItem, patch: { title?: string; body?: string; canon_status?: ContentItem['canon_status']; change_note: string }, at: string): ContentItem {
  const wasPublished = Boolean(item.published_at) || item.status === 'published' || item.status === 'revised'
  const next: ContentItem = {
    ...item,
    title: patch.title ?? item.title,
    body: patch.body ?? item.body,
    canon_status: patch.canon_status ?? item.canon_status,
    canon_version: CANON_VERSION,
    updated_at: at,
  }
  if (!wasPublished) return { ...next, status: item.status === 'draft' || item.status === 'review' ? item.status : 'draft' }
  return {
    ...next,
    status: 'draft',
    content_version: item.content_version + 1,
    history: [
      ...item.history,
      {
        content_version: item.content_version,
        title: item.title,
        body: item.body,
        canon_status: item.canon_status,
        canon_version: item.canon_version,
        status: 'revised',
        created_at: item.updated_at,
        change_note: patch.change_note,
      },
    ],
  }
}
