// Publication validation (§5.2, R0.4): a title without a complete body must
// fail. Mirrors public.content_is_publishable() in the database.
import type { ContentItem } from './types'

export const MIN_BODY_CHARS = 400
export const PLACEHOLDER_RE = /(lorem ipsum|\bTBD\b|\bTODO\b|coming soon|\[placeholder\]|to be written|content to follow)/i

export interface PublicationCheck {
  ok: boolean
  errors: string[]
}

export function validateForPublication(item: Pick<ContentItem, 'title' | 'body' | 'canon_version' | 'content_version' | 'type' | 'order' | 'updated_at'>): PublicationCheck {
  const errors: string[] = []
  if (!item.title?.trim()) errors.push('Title is missing.')
  const body = item.body?.trim() ?? ''
  if (!body) errors.push('Body is empty: a title without a body cannot be published.')
  else if (body.length < MIN_BODY_CHARS) errors.push(`Body is incomplete (${body.length} characters; at least ${MIN_BODY_CHARS} are required).`)
  if (PLACEHOLDER_RE.test(body)) errors.push('Body contains placeholder text.')
  if (!item.canon_version) errors.push('Canon version is missing.')
  if (!item.content_version || item.content_version < 1) errors.push('Content version is missing.')
  if (item.type === 'chapter' && (item.order === undefined || item.order < 1)) errors.push('Chapter order is missing.')
  if (!item.updated_at) errors.push('Update timestamp is missing.')
  return { ok: errors.length === 0, errors }
}

/** Visible to readers only when published AND complete. */
export function isPubliclyVisible(item: ContentItem): boolean {
  return item.status === 'published' && validateForPublication(item).ok
}
