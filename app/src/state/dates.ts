// Local-time date helpers. Everything is keyed on a yyyy-mm-dd string rather
// than a Date so that a stored enrolment survives a timezone change without
// the day count jumping.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** yyyy-mm-dd for the given date in the device's own timezone. */
export function toISODate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  // Constructed at local midnight; parsing the string directly would be UTC.
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from `from` to `to`, both yyyy-mm-dd. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = parse(to).getTime() - parse(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** yyyy-mm-dd `n` days after `iso`. */
export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** "2 Sept" */
export function formatShort(iso: string): string {
  const d = parse(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Tuesday" */
export function weekday(iso: string): string {
  return WEEKDAYS[parse(iso).getDay()];
}

/** "2 September" */
export function formatLong(iso: string): string {
  const d = parse(iso);
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()} ${full[d.getMonth()]}`;
}

/** "September 2026", for the profile's joined-on line. */
export function formatMonthYear(iso: string): string {
  const d = parse(iso);
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${full[d.getMonth()]} ${d.getFullYear()}`;
}

/** "07:33" in local time, for stamping a completed practice. */
export function clockTime(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
