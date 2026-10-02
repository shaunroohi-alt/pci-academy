'use client'

import { useActionState } from 'react'
import { saveSettings, type SettingsState } from '@/app/admin/actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { LessonPackage, Service } from '@/lib/data'
import { centsToDollarsInput } from '@/lib/format'

export function SettingsForm({ services, packages, markup, serviceArea, contactEmail, contactPhone }: { services: Service[]; packages: LessonPackage[]; markup: number; serviceArea: string; contactEmail: string; contactPhone: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettings, null)
  return (
    <form action={action} className="mt-6 space-y-6">
      {state?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.saved && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">Settings saved.</p>}

      <section className="card">
        <p className="eyebrow">Piano technician services</p>
        <div className="table-wrap mt-3">
          <table className="table min-w-[560px]">
            <thead><tr><th>Service</th><th>Price (USD)</th><th>Price note</th><th>Active</th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.slug}>
                  <td className="font-medium">{s.name}</td>
                  <td><input name={`service:${s.slug}:price`} inputMode="decimal" defaultValue={centsToDollarsInput(s.price_cents)} className="input mt-0 w-32" placeholder="TBA" aria-label={`${s.name} price`} /></td>
                  <td><input name={`service:${s.slug}:note`} defaultValue={s.price_note} className="input mt-0" placeholder="e.g. From, per visit" aria-label={`${s.name} price note`} /></td>
                  <td><input type="checkbox" name={`service:${s.slug}:active`} defaultChecked={s.is_active} aria-label={`${s.name} active`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow text-plum">Lesson packages</p>
        <div className="table-wrap mt-3">
          <table className="table min-w-[480px]">
            <thead><tr><th>Package</th><th>Lessons</th><th>Price (USD)</th><th>Active</th></tr></thead>
            <tbody>
              {packages.map((k) => (
                <tr key={k.slug}>
                  <td className="font-medium">{k.name}</td>
                  <td className="text-sm text-muted">{k.lessons_count} × {k.lesson_minutes} min{k.billing === 'monthly' ? ' / month' : ''}</td>
                  <td><input name={`package:${k.slug}:price`} inputMode="decimal" defaultValue={centsToDollarsInput(k.price_cents)} className="input mt-0 w-32" placeholder="TBA" aria-label={`${k.name} price`} /></td>
                  <td><input type="checkbox" name={`package:${k.slug}:active`} defaultChecked={k.is_active} aria-label={`${k.name} active`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><p className="eyebrow">Marketplace and contact</p></div>
        <div>
          <label htmlFor="marketplace_markup_percent" className="label">Default markup on pianos we resell (%)</label>
          <input id="marketplace_markup_percent" name="marketplace_markup_percent" inputMode="decimal" defaultValue={markup} className="input" />
          <p className="help">Applied on top of the buy price when a list price is left blank.</p>
        </div>
        <div>
          <label htmlFor="service_area" className="label">Service area note</label>
          <input id="service_area" name="service_area" defaultValue={serviceArea} className="input" />
          <p className="help">Shown under the services list.</p>
        </div>
        <div>
          <label htmlFor="contact_email" className="label">Contact email</label>
          <input id="contact_email" name="contact_email" type="email" defaultValue={contactEmail} className="input" />
        </div>
        <div>
          <label htmlFor="contact_phone" className="label">Contact phone</label>
          <input id="contact_phone" name="contact_phone" type="tel" defaultValue={contactPhone} className="input" />
        </div>
      </section>

      <SubmitButton pendingText="Saving…">Save all settings</SubmitButton>
    </form>
  )
}
