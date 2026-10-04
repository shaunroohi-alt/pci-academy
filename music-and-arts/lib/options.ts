// Enumerations shared by forms, validation and the admin area.
export const PIANO_TYPES = [
  { value: 'upright', label: 'Upright' },
  { value: 'grand', label: 'Grand / Baby grand' },
  { value: 'digital_hybrid', label: 'Digital or hybrid' },
  { value: 'other', label: 'Other / not sure' },
] as const

export const BUYER_PIANO_TYPES = [{ value: 'any', label: 'Any' }, ...PIANO_TYPES.filter((t) => t.value !== 'other')] as const

export const TIME_WINDOWS = [
  { value: 'morning', label: 'Morning (8am to 12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm to 4pm)' },
  { value: 'evening', label: 'Evening (4pm to 7pm)' },
  { value: 'flexible', label: 'Flexible' },
] as const

export const CONDITIONS = [
  { value: 'excellent', label: 'Excellent: recently serviced, plays beautifully' },
  { value: 'good', label: 'Good: plays well, minor cosmetic wear' },
  { value: 'fair', label: 'Fair: needs tuning or some repairs' },
  { value: 'poor', label: 'Poor: significant issues' },
  { value: 'unknown', label: 'Not sure' },
] as const

export const TIMELINES = [
  { value: 'asap', label: 'As soon as possible' },
  { value: '1_3_months', label: 'Within 1 to 3 months' },
  { value: '3_6_months', label: 'Within 3 to 6 months' },
  { value: 'browsing', label: 'Just browsing' },
] as const

export const EXPERIENCE = [
  { value: 'beginner', label: 'Complete beginner' },
  { value: 'some', label: 'Some lessons or self-taught' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const

export const LESSON_FORMATS = [
  { value: 'in_person', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'either', label: 'Either' },
] as const

export const APPOINTMENT_STATUSES = ['requested', 'confirmed', 'completed', 'cancelled'] as const
export const LISTING_STATUSES = ['new', 'reviewing', 'offer_made', 'listed', 'sold', 'declined'] as const
export const BUYER_STATUSES = ['new', 'contacted', 'matched', 'closed'] as const
export const DEAL_STATUSES = ['proposed', 'agreed', 'paid', 'delivered', 'cancelled'] as const
export const INQUIRY_STATUSES = ['new', 'contacted', 'trial_booked', 'enrolled', 'closed'] as const

export function values<T extends readonly { value: string }[]>(list: T) {
  return list.map((o) => o.value) as [T[number]['value'], ...T[number]['value'][]]
}
