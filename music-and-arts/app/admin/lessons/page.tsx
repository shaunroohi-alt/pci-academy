import { Contact } from '@/components/admin/Contact'
import { Filter } from '@/components/admin/Filter'
import { StatusForm } from '@/components/admin/StatusForm'
import { StatusBadge } from '@/components/StatusBadge'
import { requireAdmin } from '@/lib/admin-auth'
import { listInquiries } from '@/lib/data'
import { formatDateTime, humanize } from '@/lib/format'
import { INQUIRY_STATUSES } from '@/lib/options'

export const dynamic = 'force-dynamic'

export default async function LessonInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin()
  const { status } = await searchParams
  const valid = INQUIRY_STATUSES.includes(status as never) ? status : undefined
  const rows = await listInquiries(valid)
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">Lesson enquiries</h1>
        <Filter base="/admin/lessons" current={valid} statuses={INQUIRY_STATUSES} />
      </div>
      <div className="table-wrap mt-6">
        <table className="table">
          <thead><tr><th>Ref</th><th>Parent</th><th>Student</th><th>Program / package</th><th>Availability</th><th>Notes</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted">No enquiries.</td></tr>}
            {rows.map((i) => (
              <tr key={i.id}>
                <td><code className="text-xs">{i.ref}</code><p className="mt-1 text-xs text-muted">{formatDateTime(i.created_at)}</p></td>
                <td><Contact name={i.parent_name} email={i.email} phone={i.phone} /></td>
                <td className="text-sm"><strong>{i.student_name}</strong>{i.student_age != null && `, ${i.student_age}`}<br /><span className="text-muted">{humanize(i.experience)} · {humanize(i.format)}</span></td>
                <td className="text-sm">{i.program_name}<br /><span className="text-muted">{i.package_name ?? 'Package undecided'}</span></td>
                <td className="max-w-[180px] whitespace-pre-line text-xs text-muted">{i.availability}</td>
                <td className="max-w-[220px] whitespace-pre-line text-xs text-muted">{i.notes}</td>
                <td><StatusBadge status={i.status} /><div className="mt-2"><StatusForm table="lesson_inquiries" id={i.id} status={i.status} statuses={INQUIRY_STATUSES} notes={i.admin_notes} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
