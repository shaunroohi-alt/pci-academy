import { Contact } from '@/components/admin/Contact'
import { Filter } from '@/components/admin/Filter'
import { StatusForm } from '@/components/admin/StatusForm'
import { StatusBadge } from '@/components/StatusBadge'
import { requireAdmin } from '@/lib/admin-auth'
import { listAppointments } from '@/lib/data'
import { formatDate, formatDateTime, humanize } from '@/lib/format'
import { APPOINTMENT_STATUSES } from '@/lib/options'

export const dynamic = 'force-dynamic'

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin()
  const { status } = await searchParams
  const valid = APPOINTMENT_STATUSES.includes(status as never) ? status : undefined
  const rows = await listAppointments(valid)
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">Appointments</h1>
        <Filter base="/admin/appointments" current={valid} statuses={APPOINTMENT_STATUSES} />
      </div>
      <div className="table-wrap mt-6">
        <table className="table">
          <thead><tr><th>Ref</th><th>Service</th><th>Customer</th><th>Piano</th><th>Preferred</th><th>Notes</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted">No appointments{valid ? ` with status ${humanize(valid)}` : ''}.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id}>
                <td><code className="text-xs">{a.ref}</code><p className="mt-1 text-xs text-muted">{formatDateTime(a.created_at)}</p></td>
                <td className="font-medium">{a.service_name}</td>
                <td><Contact name={a.customer_name} email={a.email} phone={a.phone} extra={`${a.address_line}, ${a.city} ${a.postal_code}`.trim()} /></td>
                <td className="text-sm">{humanize(a.piano_type)}{a.piano_brand && <><br />{a.piano_brand}</>}{a.piano_notes && <p className="mt-1 text-xs text-muted">{a.piano_notes}</p>}</td>
                <td className="text-sm">{a.preferred_date ? formatDate(a.preferred_date) : 'Any date'}<br /><span className="text-muted">{humanize(a.preferred_window)}</span></td>
                <td className="max-w-[220px] whitespace-pre-line text-xs text-muted">{a.notes}</td>
                <td><StatusBadge status={a.status} /><div className="mt-2"><StatusForm table="appointments" id={a.id} status={a.status} statuses={APPOINTMENT_STATUSES} notes={a.admin_notes} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
