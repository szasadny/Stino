import {
  DAYS_PER_WEEK,
  MONTH_GRID_CELLS,
  MONTHS_PER_YEAR,
  PLAUSIBLE_YEAR_MAX,
  PLAUSIBLE_YEAR_MIN,
} from './constants'

type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type DateSpan = readonly [Date, ...Date[]]

export const WEEKDAY_INDEXES: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6]

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

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

const ISO_DATE = /^(\d{4,})-(\d{2})-(\d{2})$/

const pad2 = (n: number): string => String(n).padStart(2, '0')

function monthName(month: number): string {
  return MONTH_NAMES[month] ?? ''
}

export function mondayIndex(d: Date): WeekdayIndex {
  return WEEKDAY_INDEXES[(d.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK] ?? 0
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function currentDateKey(): string {
  return toISODate(new Date())
}

export function toLocalTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// Never `new Date(string)`: it reads the date as UTC and can shift the day. Malformed ⇒ Invalid Date.
export function fromISODate(iso: string): Date {
  const match = ISO_DATE.exec(iso)
  if (!match) return new Date(NaN)
  const date = new Date(2000, 0, 1)
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date
}

export function isPlausibleISODate(iso: string): boolean {
  const date = fromISODate(iso)
  const year = date.getFullYear()
  return year >= PLAUSIBLE_YEAR_MIN && year <= PLAUSIBLE_YEAR_MAX && toISODate(date) === iso
}

export function toRRuleDate(iso: string): string {
  return iso.replace(/-/g, '')
}

// A DATE-TIME UNTIL is UTC midnight (backend recurrence.rs), so its date part is the local date.
export function fromRRuleDate(raw: string): string | null {
  const basic = raw.trim()
  if (!/^\d{8}/.test(basic)) return null
  return `${basic.slice(0, 4)}-${basic.slice(4, 6)}-${basic.slice(6, 8)}`
}

export function addDays(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta)
}

export function addWeeks(anchor: Date, delta: number): Date {
  return addDays(anchor, delta * DAYS_PER_WEEK)
}

// "Next week" is the same weekday a week on.
export function quickDates(today: Date): { today: string; tomorrow: string; nextWeek: string } {
  return {
    today: toISODate(today),
    tomorrow: toISODate(addDays(today, 1)),
    nextWeek: toISODate(addWeeks(today, 1)),
  }
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const base = firstOfMonth(year, month + delta)
  return { year: base.getFullYear(), month: base.getMonth() }
}

export function firstOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * MONTHS_PER_YEAR + to.getMonth() - from.getMonth()
}

export function isSameMonth(d: Date, month: number): boolean {
  return d.getMonth() === month
}

export function startOfWeek(d: Date): Date {
  return addDays(d, -mondayIndex(d))
}

function daysFrom(start: Date, count: number): DateSpan {
  return [start, ...Array.from({ length: count - 1 }, (_, i) => addDays(start, i + 1))]
}

export function spanBounds(span: DateSpan): [string, string] {
  return [toISODate(span[0]), toISODate(span.at(-1) ?? span[0])]
}

export function buildWeekGrid(anchor: Date): DateSpan {
  return daysFrom(startOfWeek(anchor), DAYS_PER_WEEK)
}

// Always the same cell count so the layout never reflows between months.
export function buildMonthGrid(year: number, month: number): DateSpan {
  return daysFrom(startOfWeek(firstOfMonth(year, month)), MONTH_GRID_CELLS)
}

export function monthWeekCount(year: number, month: number): number {
  const offset = mondayIndex(firstOfMonth(year, month))
  return Math.ceil((offset + daysInMonth(year, month)) / DAYS_PER_WEEK)
}

export function weekdayAbbrev(d: Date): string {
  return WEEKDAYS[mondayIndex(d)]
}

export function weekdayLong(d: Date): string {
  return WEEKDAY_NAMES[mondayIndex(d)]
}

export function formatShortDate(iso: string): string {
  const d = fromISODate(iso)
  return `${weekdayAbbrev(d)} ${d.getDate()} ${monthName(d.getMonth())}`
}

export function formatDayFull(d: Date): string {
  return `${weekdayLong(d)}, ${d.getDate()} ${monthName(d.getMonth())}`
}

export function formatMonthYear(year: number, month: number): string {
  return `${monthName(month)} ${year}`
}

// e.g. "22–28 June 2026"; repeats month/year only across the boundary crossed.
export function formatWeekRange(dates: DateSpan): string {
  const start = dates[0]
  const end = dates.at(-1) ?? start
  const startMonth = monthName(start.getMonth())
  const endMonth = monthName(end.getMonth())
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${startMonth} ${start.getFullYear()} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`
  }
  return `${start.getDate()}–${end.getDate()} ${startMonth} ${start.getFullYear()}`
}

// e.g. "26 Oct – 1 Nov"; the year shows only when the range leaves `currentYear`.
export function formatWeekRangeCompact(dates: DateSpan, currentYear: number): string {
  const start = dates[0]
  const end = dates.at(-1) ?? start
  const startMonth = monthName(start.getMonth()).slice(0, 3)
  const endMonth = monthName(end.getMonth()).slice(0, 3)
  const outsideYear = start.getFullYear() !== currentYear || end.getFullYear() !== currentYear
  const year = outsideYear ? ` ${end.getFullYear()}` : ''
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${endMonth}${year}`
  }
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}${year}`
}
