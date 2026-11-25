import { DAYS_PER_WEEK, RECURRENCE_SNAP_MAX_DAYS } from '../constants'
import {
  addDays,
  daysInMonth,
  firstOfMonth,
  fromISODate,
  mondayIndex,
  monthsBetween,
  toISODate,
} from '../date'
import {
  WORKDAY_CODE,
  WORKDAYS,
  weekdayCode,
  type MonthlyFields,
  type RecurrenceValue,
  type WeekdayCode,
} from './model'
import { parseRRule } from './rrule-parse'

// The backend skips a DTSTART its rule doesn't generate; unmodeled shapes keep `start`.
export function firstOccurrenceOnOrAfter(rule: string, start: string): string {
  const value = parseRRule(rule)
  if (value.freq === 'none') return start
  const from = fromISODate(start)
  const startWeekOffset = mondayIndex(from)
  for (let i = 0; i < RECURRENCE_SNAP_MAX_DAYS; i++) {
    const day = addDays(from, i)
    const week = Math.floor((i + startWeekOffset) / DAYS_PER_WEEK)
    if (matches(value, from, day, week)) return toISODate(day)
  }
  return start
}

// `week` counts Monday-first weeks from the start's week (RRULE's default WKST).
function matches(value: RecurrenceValue, start: Date, day: Date, week: number): boolean {
  switch (value.freq) {
    case 'none':
      return false
    case 'daily':
    case 'yearly':
      return true
    case 'weekly':
      return onWeekdays(value.weekdays, day)
    case 'monthly':
      return onMonthly(value, day)
    case 'custom':
      if (value.unit === 'day') return true
      if (value.unit === 'week')
        return week % value.interval === 0 && onWeekdays(value.weekdays, day)
      return monthsBetween(start, day) % value.interval === 0 && onMonthly(value, day)
  }
}

// An empty list repeats on the start's weekday, which the scan's first day already is.
function onWeekdays(weekdays: readonly WeekdayCode[], day: Date): boolean {
  return weekdays.length === 0 || weekdays.includes(weekdayCode(day))
}

function onMonthly(fields: MonthlyFields, day: Date): boolean {
  const year = day.getFullYear()
  const month = day.getMonth()
  if (fields.monthlyMode === 'monthday') {
    const target = fields.monthday === -1 ? daysInMonth(year, month) : fields.monthday
    return day.getDate() === target
  }
  const codes = fields.monthWeekday === WORKDAY_CODE ? WORKDAYS : [fields.monthWeekday]
  const candidates: number[] = []
  for (let d = firstOfMonth(year, month); d.getMonth() === month; d = addDays(d, 1)) {
    if (codes.includes(weekdayCode(d))) candidates.push(d.getDate())
  }
  const pick = fields.position === -1 ? candidates.at(-1) : candidates[fields.position - 1]
  return pick === day.getDate()
}
