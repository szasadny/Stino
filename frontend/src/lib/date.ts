// All calendar date math lives here, not in the views. Dates are treated as
// LOCAL calendar dates (Hard Rule 7): never serialize through `toISOString()`,
// which converts to UTC and can shift the day. `toISODate` reads the local
// Y/M/D components directly.

/** Weekday column headers, Monday-first (matches the grid below). */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Local `YYYY-MM-DD` for a Date — the wire format the API expects. */
export function toISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a local `YYYY-MM-DD` into a Date at local midnight — the inverse of
 * `toISODate`. Built from Y/M/D parts (never `new Date(string)`, which treats a
 * bare date as UTC and can shift the day — Hard Rule 7).
 */
export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Compact date label for inline hints, e.g. "Fri 26 June". */
export function formatShortDate(d: Date): string {
  return `${weekdayAbbrev(d)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

/**
 * The 6×7 grid of dates covering a month, Monday-first. Always 42 cells so the
 * layout never reflows between months; cells outside the month are the trailing
 * days of the previous/next month (the caller dims them).
 */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  // getDay(): 0=Sun…6=Sat. Days since Monday = (getDay() + 6) % 7.
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

/** Step `delta` months from a year/month, rolling the year over as needed. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const base = new Date(year, month + delta, 1)
  return { year: base.getFullYear(), month: base.getMonth() }
}

/** True if `d` belongs to the given month (used to dim spill-over cells). */
export function isSameMonth(d: Date, month: number): boolean {
  return d.getMonth() === month
}

/** e.g. "June 2026" — the month-header title. */
export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`
}

/** e.g. "Wednesday, 24 June" — the day-sheet header. */
export function formatDayFull(d: Date): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' })
  return `${weekday}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

/** Short weekday label for a date — Monday-first English, matches `WEEKDAYS`. */
export function weekdayAbbrev(d: Date): string {
  return WEEKDAYS[(d.getDay() + 6) % 7]
}

/** Monday (local) of the week containing `d`, as a plain date. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
}

/** The 7 Monday-first dates of the week containing `anchor`. */
export function buildWeekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

/** Step `delta` weeks from `anchor` (negative = back); returns a date in that week. */
export function addWeeks(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta * 7)
}

/**
 * The week-header title for a span of dates, e.g. "22–28 June 2026". Repeats the
 * month/year only across the boundary it crosses: same month ⇒ once at the end;
 * same year, two months ⇒ "29 June – 5 July 2026"; across years ⇒ both in full.
 */
export function formatWeekRange(dates: Date[]): string {
  const start = dates[0]
  const end = dates[dates.length - 1]
  const startDay = start.getDate()
  const endDay = end.getDate()
  const startMonth = MONTH_NAMES[start.getMonth()]
  const endMonth = MONTH_NAMES[end.getMonth()]

  if (start.getFullYear() !== end.getFullYear()) {
    return `${startDay} ${startMonth} ${start.getFullYear()} – ${endDay} ${endMonth} ${end.getFullYear()}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${end.getFullYear()}`
  }
  return `${startDay}–${endDay} ${startMonth} ${start.getFullYear()}`
}
