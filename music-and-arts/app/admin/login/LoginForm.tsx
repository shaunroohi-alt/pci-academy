'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '../actions'
import { SubmitButton } from '@/components/SubmitButton'

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(login, null)
  return (
    <form action={action} className="mt-5 space-y-4">
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        {state?.error && <p className="error">{state.error}</p>}
      </div>
      <SubmitButton pendingText="Checking…">Log in</SubmitButton>
    </form>
  )
}
