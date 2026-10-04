import { redirect } from 'next/navigation'
import { adminConfigured, isAdmin } from '@/lib/admin-auth'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin')
  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="card">
        <p className="eyebrow">Staff</p>
        <h1 className="mt-2 text-2xl font-semibold">Log in</h1>
        {adminConfigured() ? (
          <LoginForm />
        ) : (
          <p className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            The admin area is not configured yet. Set the <code>ADMIN_PASSWORD</code> environment variable and restart the server.
          </p>
        )}
      </div>
    </div>
  )
}
