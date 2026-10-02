import { requireAdmin } from '@/lib/admin-auth'
import { getMarkupPercent, getSetting, listPackages, listServices } from '@/lib/data'
import { SettingsForm } from './SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireAdmin()
  const [services, packages, markup, serviceArea, contactEmail, contactPhone] = await Promise.all([
    listServices(false), listPackages(false), getMarkupPercent(),
    getSetting<string>('service_area', ''), getSetting<string>('contact_email', ''), getSetting<string>('contact_phone', ''),
  ])
  return (
    <>
      <h1 className="text-3xl font-semibold">Prices &amp; settings</h1>
      <p className="mt-1 text-sm text-muted">Prices left blank show as &quot;to be announced&quot; on the site. Changes are live immediately.</p>
      <SettingsForm services={services} packages={packages} markup={markup} serviceArea={serviceArea} contactEmail={contactEmail} contactPhone={contactPhone} />
    </>
  )
}
