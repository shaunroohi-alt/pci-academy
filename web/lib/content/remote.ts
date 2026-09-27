// Published corpus from Supabase (RLS: published rows are world-readable).
import { supabase } from '@/lib/supabase/client'
import type { ContentItem } from './types'

interface ItemRow {
  id: string
  slug: string
  type: ContentItem['type']
  collection: ContentItem['collection'] | null
  title: string
  summary: string | null
  canon_status: ContentItem['canon_status']
  status: ContentItem['status']
  chapter_order: number | null
  current_version: number | null
  updated_at: string
  published_at: string | null
  content_versions: { content_version: number; title: string; body: string; canon_status: ContentItem['canon_status']; canon_version: string; status: ContentItem['status']; created_at: string; change_note: string | null }[]
}

export async function fetchRemoteContent(): Promise<ContentItem[]> {
  const sb = supabase()
  if (!sb) return []
  const { data, error } = await sb.from('content_items').select('*, content_versions(*)')
  if (error) throw new Error(error.message)
  return ((data ?? []) as ItemRow[]).map((row) => {
    const versions = [...row.content_versions].sort((a, b) => a.content_version - b.content_version)
    const current = versions.find((v) => v.content_version === row.current_version) ?? versions.at(-1)
    return {
      id: row.id,
      slug: row.slug,
      type: row.type,
      collection: row.collection ?? (row.type === 'chapter' ? 'art-of-being' : 'articles'),
      title: current?.title ?? row.title,
      summary: row.summary ?? '',
      body: current?.body ?? '',
      status: row.status,
      canon_status: current?.canon_status ?? row.canon_status,
      canon_version: current?.canon_version ?? '',
      content_version: current?.content_version ?? 0,
      order: row.chapter_order ?? undefined,
      related: [],
      concepts: [],
      updated_at: row.updated_at,
      published_at: row.published_at ?? undefined,
      history: versions
        .filter((v) => v !== current)
        .map((v) => ({ content_version: v.content_version, title: v.title, body: v.body, canon_status: v.canon_status, canon_version: v.canon_version, status: v.status, created_at: v.created_at, change_note: v.change_note ?? '' })),
    }
  })
}
