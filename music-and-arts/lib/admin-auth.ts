import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COOKIE = 'maa_admin'
const TTL_SECONDS = 60 * 60 * 24 * 7

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
  if (!s) throw new Error('ADMIN_PASSWORD is not set')
  return s
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD)
}

export function checkPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function createSession() {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const payload = `admin.${exp}`
  const token = `${payload}.${sign(payload)}`
  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

export async function destroySession() {
  const store = await cookies()
  store.delete(COOKIE)
}

export async function isAdmin() {
  if (!adminConfigured()) return false
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [who, expStr, sig] = parts
  const payload = `${who}.${expStr}`
  const expected = sign(payload)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
  return who === 'admin' && Number(expStr) > Math.floor(Date.now() / 1000)
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin/login')
}
