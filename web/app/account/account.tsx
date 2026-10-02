'use client'

import Link from 'next/link'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Label, Notice, PageHeader, Section, Select, Switch } from '@/components/ui/primitives'
import { remoteStatus } from '@/lib/ai/remote'
import { useApp, useData } from '@/lib/app/context'
import { voices } from '@/lib/audio/speech'
import { IndexedDBStore } from '@/lib/db/local'
import type { Appearance, ClientError } from '@/lib/db/types'
import { flagsForPlan } from '@/lib/entitlements'
import { backendConfigured, env } from '@/lib/env'
import { CANON_VERSION, ENGINE_VERSION, ENTITLEMENT_FLAGS } from '@/lib/pci/canon'
import { supabase } from '@/lib/supabase/client'
import { download, formatDateTime } from '@/lib/utils'
import { AuthPanel } from './auth-panel'

export function Account() {
  const { prefs, setPrefs, repo, mode, session, sync, syncEngine, provider } = useApp()
  const [remote, setRemote] = React.useState<{ available: boolean; provider?: string; model?: string; reason?: string } | null>(null)
  const [confirmText, setConfirmText] = React.useState('')
  const [notice, setNotice] = React.useState<string | null>(null)
  const [voiceList, setVoiceList] = React.useState<SpeechSynthesisVoice[]>([])
  const { data: counts } = useData(async (r) => {
    const ex = await r.exportAll()
    return Object.fromEntries(Object.entries(ex.collections).map(([k, v]) => [k, v.length])) as Record<string, number>
  }, [])
  const { data: errors } = useData((r) => r.raw.list<ClientError>('client_errors'), [])

  React.useEffect(() => {
    if (backendConfigured && session) void remoteStatus().then(setRemote)
  }, [session])

  React.useEffect(() => {
    const load = () => setVoiceList(voices())
    load()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = load
  }, [])

  const exportAll = async () => {
    if (!repo) return
    const data = await repo.exportAll()
    download(`pci-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
  }

  const deleteAll = async () => {
    if (!repo || confirmText !== 'DELETE') return
    if (syncEngine) await syncEngine.deleteRemote()
    await repo.deleteAll()
    setConfirmText('')
    setNotice('All private material has been deleted.')
  }

  const deleteAccount = async () => {
    const sb = supabase()
    if (!sb || !repo || confirmText !== 'DELETE') return
    const { error } = await sb.functions.invoke('pci-analyze', { body: { action: 'delete_account' } })
    if (error) {
      setNotice(`Account deletion failed: ${error.message}`)
      return
    }
    await repo.deleteAll()
    await sb.auth.signOut()
    setNotice('Your account and all of its material have been deleted.')
  }

  const adoptDevice = async () => {
    if (!syncEngine) return
    const device = new IndexedDBStore('pci-local')
    await syncEngine.adopt(device)
    await device.close()
    setNotice('Material from this device has been added to your account.')
  }

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  const flags = flagsForPlan('open')

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Account" title={mode === 'account' ? (session?.user.email ?? 'Account') : 'This device'}>
        {mode === 'account'
          ? 'Your material is stored in your account, isolated by row-level security, and mirrored on this device so it works offline.'
          : 'There is no account in this edition. Everything you write is stored in this browser on this device, and nowhere else.'}
      </PageHeader>

      {notice ? (
        <Notice tone="accent" className="mb-8">
          {notice}
        </Notice>
      ) : null}

      {backendConfigured ? (
        <Section title={mode === 'account' ? 'Signed in' : 'Sign in'} eyebrow="Account">
          {mode === 'account' ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => supabase()?.auth.signOut()}>
                Sign out
              </Button>
              <Button variant="outline" onClick={adoptDevice}>
                Add this device’s material to my account
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-[14px] text-ink-2">Sign in to keep your material in your account and on every device you use. Until then, material stays on this device.</p>
              <AuthPanel />
            </>
          )}
        </Section>
      ) : null}

      {mode === 'account' && sync ? (
        <Section title="Synchronisation" eyebrow="Sync" id="sync">
          <p className="text-[14px] text-ink-2">
            {sync.online ? 'Online' : 'Offline'} · {sync.pending} waiting · last synced {sync.lastSync ? formatDateTime(sync.lastSync) : 'not yet'}
          </p>
          {sync.error ? <Notice tone="danger" className="mt-3">{sync.error}</Notice> : null}
          {sync.conflicts.length ? (
            <div className="mt-4 space-y-3">
              <Notice tone="danger" title="Conflicts">
                These documents changed on another device after this device last saw them. Nothing has been overwritten. Choose which version to keep.
              </Notice>
              {sync.conflicts.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-[3px] border border-line p-3 text-[13px]">
                  <span className="flex-1">
                    {c.collection.replace(/_/g, ' ')} · {c.doc_id}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => syncEngine?.resolveKeepLocal(c.id)}>
                    Keep this device’s
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => repo && syncEngine?.resolveKeepRemote(c.id, repo)}>
                    Keep the other (save mine to Ledger)
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <Button size="sm" variant="outline" className="mt-4" onClick={() => syncEngine?.sync()}>
            Sync now
          </Button>
        </Section>
      ) : null}

      <Section title="Privacy" eyebrow="Controls">
        <div className="divide-y divide-line border-y border-line">
          <Switch
            id="pref-longitudinal"
            checked={prefs.longitudinal}
            onChange={(v) => setPrefs({ longitudinal: v })}
            label="Compare new material with my earlier material"
            description="Lets the engine read your earlier observations, journal, ledger and On the Contrary sessions to find recurrence, revisions and context changes. Off by default; switching it off stops all longitudinal comparison immediately."
          />
          <Switch
            id="pref-writeup"
            checked={prefs.writeup}
            onChange={(v) => setPrefs({ writeup: v })}
            label="Write my reports as prose"
            description="Claude writes each report’s observation and analysis for you to read. The material being analysed (and any earlier material it is compared with) is sent to Anthropic to do this. Off keeps every analysis on this device, as structure only."
          />
          <Switch
            id="pref-twin"
            checked={prefs.twin_opt_in}
            onChange={(v) => setPrefs({ twin_opt_in: v })}
            label="Cognitive Twin"
            description={<>An opt-in, revisable structural model built from your material over time. <Link href="/relate/#twin" className="text-accent">Learn more</Link></>}
          />
          <Switch
            id="pref-training"
            checked={prefs.training_consent}
            onChange={(v) => setPrefs({ training_consent: v })}
            label="Authorise reuse of my material for model training"
            description="Off by default. Nothing in this application uses your material for training either way; this records your decision in case a future service asks."
          />
        </div>
      </Section>

      <Section title="Analysis engine" eyebrow="PCI Engine">
        <div className="space-y-3 text-[14px]">
          <label className="flex cursor-pointer items-start gap-3 rounded-[3px] border border-line p-4">
            <input type="radio" name="engine" checked={prefs.provider === 'local'} onChange={() => setPrefs({ provider: 'local' })} className="mt-1" />
            <span>
              <span className="font-medium">PCI Local Engine</span> <Badge>On this device</Badge>
              <span className="mt-1 block text-ink-2">Deterministic and lexical. Works offline; material never leaves the device. {ENGINE_VERSION}.</span>
            </span>
          </label>
          <label className={`flex items-start gap-3 rounded-[3px] border border-line p-4 ${remote?.available ? 'cursor-pointer' : 'opacity-60'}`}>
            <input type="radio" name="engine" disabled={!remote?.available} checked={prefs.provider === 'remote'} onChange={() => setPrefs({ provider: 'remote' })} className="mt-1" />
            <span>
              <span className="font-medium">PCI Engine with an AI provider</span> <Badge>Online</Badge>
              <span className="mt-1 block text-ink-2">
                {remote?.available
                  ? `Uses ${remote.provider} (${remote.model}) under the PCI contract. Output is validated on the server and again here; anything that crosses the boundary is quarantined.`
                  : !backendConfigured
                    ? 'Not configured for this deployment.'
                    : !session
                      ? 'Sign in to use it.'
                      : remote?.reason ?? 'Checking…'}
              </span>
            </span>
          </label>
          <p className="text-[12px] text-muted">In use now: {provider.label}.</p>
        </div>
      </Section>

      <Section title="Appearance and listening" eyebrow="Preferences">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="pref-appearance">Appearance</Label>
            <Select id="pref-appearance" value={prefs.appearance} onChange={(e) => setPrefs({ appearance: e.target.value as Appearance })}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="paper">Warm paper</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="pref-size">Reading size · {prefs.reader_size}px</Label>
            <input id="pref-size" type="range" min={16} max={24} value={prefs.reader_size} onChange={(e) => setPrefs({ reader_size: Number(e.target.value) })} className="w-full accent-[var(--ink)]" />
          </div>
          <div>
            <Label htmlFor="pref-rate">Listening speed · {prefs.audio_rate.toFixed(2)}×</Label>
            <input id="pref-rate" type="range" min={0.75} max={2} step={0.05} value={prefs.audio_rate} onChange={(e) => setPrefs({ audio_rate: Number(e.target.value) })} className="w-full accent-[var(--ink)]" />
          </div>
          <div>
            <Label htmlFor="pref-voice">Device voice</Label>
            <Select id="pref-voice" value={prefs.audio_voice} onChange={(e) => setPrefs({ audio_voice: e.target.value })}>
              <option value="">Default</option>
              {voiceList.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-5 border-t border-line pt-2">
          <Switch id="pref-lenses" checked={prefs.lenses_default} onChange={(v) => setPrefs({ lenses_default: v })} label="Multi-lens analysis by default" />
          <Switch id="pref-causal" checked={prefs.causal_default} onChange={(v) => setPrefs({ causal_default: v })} label="Causal hypotheses by default" />
        </div>
      </Section>

      <Section title="Your data" eyebrow="Export and deletion">
        <p className="text-[14px] text-ink-2">
          {total} private record{total === 1 ? '' : 's'}
          {counts ? ` — ${counts.observation_inputs ?? 0} observations, ${counts.journal_entries ?? 0} journal entries, ${counts.ledger_entries ?? 0} ledger entries, ${counts.contrary_sessions ?? 0} On the Contrary sessions` : ''}.
        </p>
        <Button variant="outline" className="mt-4" onClick={exportAll}>
          Export everything (JSON)
        </Button>
        <div className="mt-8 rounded-[4px] border border-danger p-5">
          <p className="font-medium text-danger">Delete</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Deletes every observation, analysis, journal entry, ledger entry, session, note, bookmark and preference{mode === 'account' ? ' — on this device and in your account' : ' on this device'}. It cannot be undone. Type DELETE to confirm.
          </p>
          <input aria-label="Type DELETE to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-3 h-9 w-40 rounded-[3px] border border-line-strong bg-transparent px-2 text-[13px]" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" size="sm" disabled={confirmText !== 'DELETE'} onClick={deleteAll}>
              Delete all my material
            </Button>
            {mode === 'account' ? (
              <Button variant="danger" size="sm" disabled={confirmText !== 'DELETE'} onClick={deleteAccount}>
                Delete my account
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Access" eyebrow="Entitlements">
        <p className="mb-3 text-[14px] text-ink-2">This edition has no paid plans. Every capability is open.</p>
        <ul className="flex flex-wrap gap-1.5">
          {ENTITLEMENT_FLAGS.map((f) => (
            <li key={f}>
              <Badge tone={flags.has(f) ? 'neutral' : 'danger'}>{f}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="About this installation" eyebrow="Diagnostics">
        <dl className="grid grid-cols-[160px_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted">Canon</dt>
          <dd>{CANON_VERSION}</dd>
          <dt className="text-muted">Engine</dt>
          <dd>{ENGINE_VERSION}</dd>
          <dt className="text-muted">Storage</dt>
          <dd>{mode === 'account' ? 'Account (Supabase) + device copy' : 'This device (IndexedDB)'}</dd>
          <dt className="text-muted">Base path</dt>
          <dd>{env.basePath || '/'}</dd>
          <dt className="text-muted">Errors recorded</dt>
          <dd>
            {errors?.length ?? 0} <span className="text-muted">(message and page only — never your material)</span>
          </dd>
        </dl>
        {errors?.length ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => download('pci-diagnostics.json', JSON.stringify({ canon: CANON_VERSION, engine: ENGINE_VERSION, errors }, null, 2))}
          >
            Download diagnostics
          </Button>
        ) : null}
      </Section>
    </div>
  )
}
