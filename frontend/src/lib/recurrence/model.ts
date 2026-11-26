import { DAYS_PER_WEEK, MAX_MONTHDAY } from '../constants'
import { fromISODate, mondayIndex } from '../date'

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export type CustomUnit = 'day' | 'week' | 'month'
export type MonthlyMode = 'monthday' | 'weekday'

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type WeekdayCode = (typeof WEEKDAY_CODES)[number]

export const WORKDAYS: readonly WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR']
// Stands in for the Mon–Fri set, so BYSETPOS picks the Nth/last *workday* of the month.
export const WORKDAY_CODE = 'WD'
export type MonthWeekday = WeekdayCode | typeof WORKDAY_CODE

// BYSETPOS values: first..fifth, then -1 for the last.
const ORDINAL_POSITIONS = [1, 2, 3, 4, 5, -1] as const
export type OrdinalPosition = (typeof ORDINAL_POSITIONS)[number]

// Every month has a 28th and a fifth workday, but not always a 29th or a fifth Monday.
export const SHORTEST_MONTH_DAYS = 28
export const FIFTH_POSITION: OrdinalPosition = 5

export const DEFAULT_CUSTOM_INTERVAL = 2
export const MAX_CUSTOM_INTERVAL = 365

export interface RecurrenceValue {
  freq: RecurrenceFreq
  interval: number
  unit: CustomUnit
  weekdays: WeekdayCode[] // empty ⇒ the start weekday
  // The monthly fields serve both Monthly and Custom every-N-months.
  monthlyMode: MonthlyMode
  monthday: number // -1 ⇒ the last day
  position: OrdinalPosition
  monthWeekday: MonthWeekday
  until: string | null // null ⇒ never ends
}

export type MonthlyFields = Pick<
  RecurrenceValue,
  'monthlyMode' | 'monthday' | 'position' | 'monthWeekday'
>

export const EMPTY_MONTHLY: MonthlyFields = {
  monthlyMode: 'monthday',
  monthday: 1,
  position: 1,
  monthWeekday: 'MO',
}

export const EMPTY_RECURRENCE: RecurrenceValue = {
  freq: 'none',
  interval: DEFAULT_CUSTOM_INTERVAL,
  unit: 'week',
  weekdays: [],
  ...EMPTY_MONTHLY,
  until: null,
}

export function isWeekdayCode(code: string): code is WeekdayCode {
  return WEEKDAY_CODES.some((c) => c === code)
}

export function isOrdinalPosition(n: number): n is OrdinalPosition {
  return ORDINAL_POSITIONS.some((p) => p === n)
}

export function isMonthday(n: number): boolean {
  return n === -1 || (n >= 1 && n <= MAX_MONTHDAY)
}

export function normalizeInterval(n: number): number {
  return Math.max(1, Math.floor(n) || 1)
}

export function orderWeekdays(codes: readonly WeekdayCode[]): WeekdayCode[] {
  return [...new Set(codes)].sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b))
}

// Expects `codes` already ordered and deduped.
export function isWorkdaySet(codes: readonly WeekdayCode[]): boolean {
  return codes.length === WORKDAYS.length && codes.every((c, i) => c === WORKDAYS[i])
}

export function weekdayCode(d: Date): WeekdayCode {
  return WEEKDAY_CODES[mondayIndex(d)]
}

// Matches the start date, so switching to Monthly doesn't always pick day 1.
export function monthlyDefaultsFor(
  iso: string | null,
): Pick<RecurrenceValue, 'monthday' | 'position' | 'monthWeekday'> {
  const { monthday, position, monthWeekday } = EMPTY_MONTHLY
  if (!iso) return { monthday, position, monthWeekday }
  const d = fromISODate(iso)
  const nth = Math.ceil(d.getDate() / DAYS_PER_WEEK)
  return {
    monthday: d.getDate(),
    position: isOrdinalPosition(nth) ? nth : position,
    monthWeekday: weekdayCode(d),
  }
}

// An end before the start leaves a series with no occurrence, so a later date drops it.
export function followStart(value: RecurrenceValue, iso: string | null): RecurrenceValue {
  if (!iso || value.freq === 'none') return value
  const followed = followShape(value, iso)
  return followed.until && followed.until < iso ? { ...followed, until: null } : followed
}

// The last day, last weekday and workday shapes are not derived from a date, so they stay.
function followShape(value: RecurrenceValue, iso: string): RecurrenceValue {
  const weekly = value.freq === 'weekly' || (value.freq === 'custom' && value.unit === 'week')
  if (weekly) return followWeekday(value, weekdayCode(fromISODate(iso)))
  const monthly = value.freq === 'monthly' || (value.freq === 'custom' && value.unit === 'month')
  if (!monthly) return value
  const { monthday, position, monthWeekday } = monthlyDefaultsFor(iso)
  if (value.monthlyMode === 'monthday')
    return value.monthday === -1 ? value : { ...value, monthday }
  if (value.position === -1 || value.monthWeekday === WORKDAY_CODE) return value
  return { ...value, position, monthWeekday }
}

function followWeekday(value: RecurrenceValue, code: WeekdayCode): RecurrenceValue {
  const { weekdays } = value
  if (weekdays.length === 0 || weekdays.includes(code)) return value
  if (weekdays.length === 1) return { ...value, weekdays: [code] }
  return { ...value, weekdays: orderWeekdays([...weekdays, code]) }
}

export function withFreq(
  value: RecurrenceValue,
  freq: RecurrenceFreq,
  startDate: string | null,
): RecurrenceValue {
  return freq === 'monthly'
    ? { ...value, freq, ...monthlyDefaultsFor(startDate) }
    : { ...value, freq }
}

export function withUnit(
  value: RecurrenceValue,
  unit: CustomUnit,
  startDate: string | null,
): RecurrenceValue {
  return unit === 'month' && value.unit !== 'month'
    ? { ...value, unit, ...monthlyDefaultsFor(startDate) }
    : { ...value, unit }
}
