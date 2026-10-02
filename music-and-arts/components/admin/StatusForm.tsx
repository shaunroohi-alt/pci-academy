import { setStatus } from '@/app/admin/actions'
import { humanize } from '@/lib/format'

export function StatusForm({ table, id, status, statuses, notes, withNotes = true }: { table: string; id: string; status: string; statuses: readonly string[]; notes?: string; withNotes?: boolean }) {
  return (
    <form action={setStatus} className="flex min-w-[220px] flex-col gap-2">
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} className="input mt-0" aria-label="Status">
        {statuses.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
      </select>
      {withNotes && <textarea name="admin_notes" defaultValue={notes} rows={2} placeholder="Internal notes" className="input mt-0" aria-label="Internal notes" />}
      <button type="submit" className="btn-outline btn-sm self-start">Save</button>
    </form>
  )
}
