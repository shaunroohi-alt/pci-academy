'use client'

// Application context. The working copy of the user's material is always an
// IndexedDB store on this device. With a Supabase backend and a signed-in
// user, a SyncEngine mirrors it to Postgres (RLS-isolated) through an outbox.
import type { Session } from '@supabase/supabase-js'
import * as React from 'react'
import { localProvider } from '@/lib/ai/local'
import type { PCIProvider } from '@/lib/ai/provider'
import { writeReflection } from '@/lib/ai/reflection-writer'
import { remoteProvider } from '@/lib/ai/remote'
import { mergeContent, SEED_CONTENT } from '@/lib/content/catalog'
import type { ContentItem } from '@/lib/content/types'
import { IndexedDBStore } from '@/lib/db/local'
import { Repository } from '@/lib/db/repository'
import { SyncEngine, type SyncStatus } from '@/lib/db/sync'
import { DEFAULT_PREFERENCES, type ClientError, type Preferences } from '@/lib/db/types'
import { backendConfigured } from '@/lib/env'
import { fetchRemoteContent } from '@/lib/content/remote'
import { supabase } from '@/lib/supabase/client'

interface AppState {
  ready: boolean
  repo: Repository | null
  prefs: Preferences
  setPrefs: (patch: Partial<Omit<Preferences, 'id'>>) => Promise<void>
  session: Session | null
  mode: 'local' | 'account'
  provider: PCIProvider
  sync: SyncStatus | null
  syncEngine: SyncEngine | null
  content: ContentItem[]
  refreshContent: () => Promise<void>
  online: boolean
  revision: number
}

const Ctx = React.createContext<AppState | null>(null)

async function loadOverlay(repo: Repository): Promise<ContentItem[]> {
  const local = await repo.raw.list<ContentItem>('cms_content')
  const remote = backendConfigured ? await fetchRemoteContent().catch(() => []) : []
  return [...remote, ...local]
}

const APPEARANCE_KEY = 'pci-appearance'
const READER_SIZE_KEY = 'pci-reader-size'

function applyAppearance(p: Preferences) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const theme = p.appearance === 'system' ? (systemDark ? 'dark' : 'light') : p.appearance
  root.dataset.theme = theme
  root.style.setProperty('--reader-size', `${p.reader_size}px`)
  try {
    localStorage.setItem(APPEARANCE_KEY, p.appearance)
    localStorage.setItem(READER_SIZE_KEY, String(p.reader_size))
  } catch {
    // Storage can be unavailable (private mode); appearance still applies for this visit.
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [authChecked, setAuthChecked] = React.useState(!backendConfigured)
  const [repo, setRepo] = React.useState<Repository | null>(null)
  const [prefs, setPrefsState] = React.useState<Preferences>(DEFAULT_PREFERENCES)
  const [sync, setSync] = React.useState<SyncStatus | null>(null)
  const [syncEngine, setSyncEngine] = React.useState<SyncEngine | null>(null)
  const [overlay, setOverlay] = React.useState<ContentItem[]>([])
  const [online, setOnline] = React.useState(true)
  const [revision, setRevision] = React.useState(0)
  const [ready, setReady] = React.useState(false)
  const prefsRef = React.useRef(prefs)
  React.useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])

  // Auth (only with a backend).
  React.useEffect(() => {
    const sb = supabase()
    if (!sb) return
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  // Storage + repository, scoped to the signed-in user or to this device.
  React.useEffect(() => {
    if (!authChecked) return
    const store = new IndexedDBStore(userId ? `pci-user-${userId}` : 'pci-local')
    const r = new Repository({
      store,
      provider: () => {
        const p = prefsRef.current
        return p.provider === 'remote' && backendConfigured && userId ? remoteProvider() : localProvider
      },
      writer: () => (prefsRef.current.writeup ? writeReflection : undefined),
    })
    let engine: SyncEngine | null = null
    let unsubSync: (() => void) | undefined
    const sb = supabase()
    if (userId && sb) {
      engine = new SyncEngine(store, sb)
      engine.attach(r)
      unsubSync = engine.subscribe(setSync)
      void engine.sync()
    }
    const unsub = r.subscribe(() => setRevision((n) => n + 1))
    setRepo(r)
    setSyncEngine(engine)
    r.preferences().then((p) => {
      setPrefsState(p)
      applyAppearance(p)
      setReady(true)
    })
    return () => {
      unsub()
      unsubSync?.()
      engine?.detach()
      void store.close()
    }
  }, [authChecked, userId])

  // CMS overlay: the local workspace, or the Supabase corpus.
  const refreshContent = React.useCallback(async () => {
    if (!repo) return
    setOverlay(await loadOverlay(repo))
  }, [repo])

  React.useEffect(() => {
    if (!repo) return
    let live = true
    loadOverlay(repo).then((o) => live && setOverlay(o))
    return () => {
      live = false
    }
  }, [repo])

  // Online status.
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // Follow the system theme when appearance is "system".
  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = () => applyAppearance(prefsRef.current)
    mq?.addEventListener('change', on)
    return () => mq?.removeEventListener('change', on)
  }, [])

  // Error monitoring (§21.1): message and route only — never user material.
  React.useEffect(() => {
    if (!repo) return
    const record = (message: string) => {
      const err: ClientError = { id: crypto.randomUUID(), at: new Date().toISOString(), message: message.slice(0, 300), route: location.pathname.slice(0, 200) }
      void repo.raw.put('client_errors', err)
      const sb = supabase()
      if (sb && userId) void sb.from('client_errors').insert({ message: err.message, route: err.route })
    }
    const onError = (e: ErrorEvent) => record(e.message || 'Unknown error')
    const onRejection = (e: PromiseRejectionEvent) => record(e.reason instanceof Error ? e.reason.message : 'Unhandled rejection')
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [repo, userId])

  const setPrefs = React.useCallback(
    async (patch: Partial<Omit<Preferences, 'id'>>) => {
      if (!repo) return
      const next = await repo.setPreferences(patch)
      setPrefsState(next)
      applyAppearance(next)
    },
    [repo],
  )

  const provider = prefs.provider === 'remote' && backendConfigured && userId ? remoteProvider() : localProvider
  const content = React.useMemo(() => mergeContent(SEED_CONTENT, overlay), [overlay])

  const value: AppState = {
    ready,
    repo,
    prefs,
    setPrefs,
    session,
    mode: userId ? 'account' : 'local',
    provider,
    sync,
    syncEngine,
    content,
    refreshContent,
    online,
    revision,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = React.useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

/**
 * Load data from the repository; reloads whenever the repository changes.
 * Data is bound to the deps it was loaded for: while deps change, `data` is
 * undefined and `loading` is true, so a view never shows one record's data
 * under another record's key.
 */
export function useData<T>(load: (repo: Repository) => Promise<T>, deps: React.DependencyList = []): { data: T | undefined; loading: boolean; error: Error | null; reload: () => void } {
  const { repo, revision } = useApp()
  const key = JSON.stringify(deps)
  const [state, setState] = React.useState<{ key: string; data: T | undefined; error: Error | null } | null>(null)
  const [nonce, setNonce] = React.useState(0)
  const loadRef = React.useRef(load)
  // Keep the latest loader; declared first so it runs before the loading effect.
  React.useEffect(() => {
    loadRef.current = load
  })
  React.useEffect(() => {
    if (!repo) return
    let live = true
    loadRef
      .current(repo)
      .then((d) => live && setState({ key, data: d, error: null }))
      .catch((e: unknown) => live && setState({ key, data: undefined, error: e instanceof Error ? e : new Error(String(e)) }))
    return () => {
      live = false
    }
  }, [repo, revision, nonce, key])
  const current = state?.key === key ? state : null
  return { data: current?.data, loading: !repo || !current, error: current?.error ?? null, reload: () => setNonce((n) => n + 1) }
}

/**
 * Debounced autosave that never drops the last edit: pending saves are
 * flushed when the component unmounts and when the page is hidden.
 */
export function useAutosave(save: () => Promise<unknown> | void, delay = 700): { schedule: () => void; flush: () => void; cancel: () => void } {
  const saveRef = React.useRef(save)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    saveRef.current = save
  })
  const flush = React.useCallback(() => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    void saveRef.current()
  }, [])
  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const schedule = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [flush, delay])
  React.useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    const onVis = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVis)
      flush()
    }
  }, [flush])
  return { schedule, flush, cancel }
}

/** Inline script: apply the stored appearance before first paint. */
export const THEME_BOOTSTRAP = `(function(){try{var a=localStorage.getItem('${APPEARANCE_KEY}')||'system';var d=a==='system'?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):a;document.documentElement.dataset.theme=d;var s=localStorage.getItem('${READER_SIZE_KEY}');if(s)document.documentElement.style.setProperty('--reader-size',s+'px')}catch(e){}})();`
