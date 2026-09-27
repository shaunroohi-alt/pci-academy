'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label, Notice } from '@/components/ui/primitives'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase/client'

export function AuthPanel() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [mode, setMode] = React.useState<'link' | 'password' | 'signup'>('link')
  const [message, setMessage] = React.useState<{ tone: 'neutral' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const sb = supabase()
    if (!sb) return
    setBusy(true)
    setMessage(null)
    const redirect = `${window.location.origin}${env.basePath}/account/`
    try {
      if (mode === 'link') {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
        if (error) throw error
        setMessage({ tone: 'neutral', text: `A sign-in link has been sent to ${email}.` })
      } else if (mode === 'password') {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        if (error) throw error
        setMessage({ tone: 'neutral', text: 'Check your email to confirm the account.' })
      }
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Sign-in failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <div>
        <Label htmlFor="auth-email">Email</Label>
        <Input id="auth-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode !== 'link' ? (
        <div>
          <Label htmlFor="auth-password">Password</Label>
          <Input id="auth-password" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {mode === 'link' ? 'Email me a sign-in link' : mode === 'password' ? 'Sign in' : 'Create account'}
        </Button>
        <select aria-label="Sign-in method" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="h-9 rounded-[3px] border border-line bg-transparent px-2 text-[13px]">
          <option value="link">Email link</option>
          <option value="password">Password</option>
          <option value="signup">New account</option>
        </select>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </form>
  )
}
