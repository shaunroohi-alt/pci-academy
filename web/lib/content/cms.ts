// CMS persistence. Local mode: a workspace in this browser (useful for the
// canon owner to prepare and preview texts). Account mode: the staff-only
// Supabase content tables, where the database re-checks publication
// validation and lifecycle transitions.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocStore } from '@/lib/db/docstore'
import type { CommunityEvent, ServiceOffering } from '@/lib/db/types'
import { CANON_VERSION } from '@/lib/pci/canon'
import { revise, transition } from './lifecycle'
import type { ContentItem, Lifecycle } from './types'

export interface CmsBackend {
  kind: 'local' | 'supabase'
  saveDraft(item: ContentItem, patch: { title?: string; body?: string; canon_status?: ContentItem['canon_status']; change_note: string }): Promise<ContentItem>
  transition(item: ContentItem, to: Lifecycle): Promise<ContentItem>
  events(): Promise<CommunityEvent[]>
  saveEvent(e: CommunityEvent): Promise<void>
  deleteEvent(id: string): Promise<void>
  services(): Promise<ServiceOffering[]>
  saveService(s: ServiceOffering): Promise<void>
  deleteService(id: string): Promise<void>
}

export function localCms(store: DocStore): CmsBackend {
  return {
    kind: 'local',
    async saveDraft(item, patch) {
      const next = revise(item, patch, new Date().toISOString())
      await store.put('cms_content', next)
      return next
    },
    async transition(item, to) {
      const next = transition(item, to, new Date().toISOString())
      await store.put('cms_content', next)
      return next
    },
    events: () => store.list<CommunityEvent>('cms_events'),
    saveEvent: (e) => store.put('cms_events', e),
    deleteEvent: (id) => store.delete('cms_events', id),
    services: () => store.list<ServiceOffering>('cms_services'),
    saveService: (s) => store.put('cms_services', s),
    deleteService: (id) => store.delete('cms_services', id),
  }
}

export function supabaseCms(sb: SupabaseClient): CmsBackend {
  const ensureItem = async (item: ContentItem) => {
    const { data, error } = await sb
      .from('content_items')
      .upsert(
        { slug: item.slug, type: item.type, collection: item.collection, title: item.title, summary: item.summary, canon_status: item.canon_status, chapter_order: item.order ?? null },
        { onConflict: 'slug', ignoreDuplicates: false },
      )
      .select('id, current_version, status')
      .single()
    if (error) throw new Error(error.message)
    return data as { id: string; current_version: number | null; status: Lifecycle }
  }
  return {
    kind: 'supabase',
    async saveDraft(item, patch) {
      const row = await ensureItem(item)
      // Versions are immutable in the database: every saved draft is a new version.
      const nextVersion = (row.current_version ?? 0) + 1
      const title = patch.title ?? item.title
      const { error } = await sb.from('content_versions').insert({
        content_id: row.id,
        content_version: nextVersion,
        title,
        body: patch.body ?? item.body,
        canon_status: patch.canon_status ?? item.canon_status,
        canon_version: CANON_VERSION,
        change_note: patch.change_note,
      })
      if (error) throw new Error(error.message)
      const status: Lifecycle = row.status === 'published' ? 'revised' : row.status === 'draft' || row.status === 'review' ? row.status : 'draft'
      const upd = await sb.from('content_items').update({ current_version: nextVersion, title, status: row.status === 'published' ? 'published' : status }).eq('id', row.id)
      if (upd.error) throw new Error(upd.error.message)
      return { ...item, title, body: patch.body ?? item.body, canon_status: patch.canon_status ?? item.canon_status, content_version: nextVersion, status: row.status === 'published' ? 'revised' : status }
    },
    async transition(item, to) {
      const row = await ensureItem(item)
      if (to === 'published') {
        const v = await sb.from('content_versions').update({ status: 'published' }).eq('content_id', row.id).eq('content_version', row.current_version)
        if (v.error) throw new Error(v.error.message)
      }
      const { error } = await sb.from('content_items').update({ status: to }).eq('id', row.id)
      if (error) throw new Error(error.message)
      return { ...item, status: to }
    },
    async events() {
      const { data, error } = await sb.from('events').select('*').order('starts_at')
      if (error) throw new Error(error.message)
      return (data ?? []) as CommunityEvent[]
    },
    async saveEvent(e) {
      const { error } = await sb.from('events').upsert(e)
      if (error) throw new Error(error.message)
    },
    async deleteEvent(id) {
      const { error } = await sb.from('events').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    async services() {
      const { data, error } = await sb.from('services').select('*').order('title')
      if (error) throw new Error(error.message)
      return (data ?? []) as ServiceOffering[]
    },
    async saveService(s) {
      const { error } = await sb.from('services').upsert(s)
      if (error) throw new Error(error.message)
    },
    async deleteService(id) {
      const { error } = await sb.from('services').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}

export async function isStaff(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.rpc('is_staff')
  return data === true
}
