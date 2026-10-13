import { humanize } from '@/lib/format'

const TONES: Record<string, string> = {
  requested: 'bg-gold-soft text-gold-deep',
  new: 'bg-gold-soft text-gold-deep',
  proposed: 'bg-gold-soft text-gold-deep',
  reviewing: 'bg-plum-soft text-plum',
  contacted: 'bg-plum-soft text-plum',
  offer_made: 'bg-plum-soft text-plum',
  trial_booked: 'bg-plum-soft text-plum',
  agreed: 'bg-plum-soft text-plum',
  confirmed: 'bg-success-soft text-success',
  listed: 'bg-success-soft text-success',
  matched: 'bg-success-soft text-success',
  enrolled: 'bg-success-soft text-success',
  paid: 'bg-success-soft text-success',
  completed: 'bg-ink/10 text-ink',
  sold: 'bg-ink/10 text-ink',
  delivered: 'bg-ink/10 text-ink',
  closed: 'bg-ink/10 text-ink',
  cancelled: 'bg-danger-soft text-danger',
  declined: 'bg-danger-soft text-danger',
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${TONES[status] ?? 'bg-ink/10 text-ink'}`}>{humanize(status)}</span>
}
