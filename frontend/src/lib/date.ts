// Dates are LOCAL calendar dates (Hard Rule 7): never go through `toISOString()` or
// `new Date(string)` — both treat the date as UTC and can shift the day.

import { PLAUSIBLE_YEAR_MAX, PLAUSIBLE_YEAR_MIN } from './constants'

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

export function toISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function isPlausibleISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [year] = iso.split('-').map(Number)
  if (year < PLAUSIBLE_YEAR_MIN || year > PLAUSIBLE_YEAR_MAX) return false
  return toISODate(fromISODate(iso)) === iso
}

export function formatShortDate(d: Date): string {
  return `${weekdayAbbrev(d)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

/** Always 42 cells so the layout never reflows between months. */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

/** Week rows (4–6) the month actually uses in `buildMonthGrid`'s layout. */
export function monthWeekCount(year: number, month: number): number {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Math.ceil((offset + daysInMonth) / 7)
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const base = new Date(year, month + delta, 1)
  return { year: base.getFullYear(), month: base.getMonth() }
}

export function isSameMonth(d: Date, month: number): boolean {
  return d.getMonth() === month
}

export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`
}

export function weekdayLong(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}

export function formatDayFull(d: Date): string {
  return `${weekdayLong(d)}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

export function weekdayAbbrev(d: Date): string {
  return WEEKDAYS[(d.getDay() + 6) % 7]
}

export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
}

export function buildWeekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

export function addWeeks(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta * 7)
}

export function addDays(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta)
}

/** e.g. "22–28 June 2026"; repeats month/year only across the boundary crossed. */
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

/** e.g. "26 Oct – 1 Nov"; the year shows only when the range leaves `currentYear`. */
export function formatWeekRangeCompact(dates: Date[], currentYear: number): string {
  const start = dates[0]
  const end = dates[dates.length - 1]
  const startMonth = MONTH_NAMES[start.getMonth()].slice(0, 3)
  const endMonth = MONTH_NAMES[end.getMonth()].slice(0, 3)
  const outsideYear = start.getFullYear() !== currentYear || end.getFullYear() !== currentYear
  const year = outsideYear ? ` ${end.getFullYear()}` : ''

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${endMonth}${year}`
  }
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}${year}`
}
