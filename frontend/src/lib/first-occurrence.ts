import { RECURRENCE_SNAP_MAX_DAYS } from './constants'
import { addDays, fromISODate, toISODate } from './date'
import {
  WEEKDAY_OPTIONS,
  WORKDAY_CODE,
  WORKDAYS,
  parseRRule,
  type MonthlyFields,
  type RecurrenceValue,
} from './recurrence'

/**
 * The backend's expansion skips a DTSTART the rule doesn't match. Only picker-modeled
 * shapes are matched; anything else keeps `start`.
 */
export function firstOccurrenceOnOrAfter(rule: string, start: string): string {
  const value = parseRRule(rule)
  if (value.freq === 'none') return start
  const from = fromISODate(start)
  const startWeekOffset = (from.getDay() + 6) % 7
  for (let i = 0; i < RECURRENCE_SNAP_MAX_DAYS; i++) {
    const day = addDays(from, i)
    const week = Math.floor((i + startWeekOffset) / 7)
    if (matches(value, from, day, week)) return toISODate(day)
  }
  return start
}

/** `week` counts Monday-first weeks from the start's week (RRULE's default WKST). */
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

function weekdayCode(d: Date): string {
  return WEEKDAY_OPTIONS[(d.getDay() + 6) % 7].code
}

/** An empty list repeats on the start's weekday, which the scan's first day already is. */
function onWeekdays(weekdays: string[], day: Date): boolean {
  return weekdays.length === 0 || weekdays.includes(weekdayCode(day))
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()
}

function onMonthly(fields: MonthlyFields, day: Date): boolean {
  if (fields.monthlyMode === 'monthday') {
    return fields.monthday === -1
      ? addDays(day, 1).getDate() === 1
      : day.getDate() === fields.monthday
  }
  const codes = fields.monthWeekday === WORKDAY_CODE ? WORKDAYS : [fields.monthWeekday]
  const candidates: number[] = []
  for (
    let d = new Date(day.getFullYear(), day.getMonth(), 1);
    d.getMonth() === day.getMonth();
    d = addDays(d, 1)
  ) {
    if (codes.includes(weekdayCode(d))) candidates.push(d.getDate())
  }
  const pick = fields.position === -1 ? candidates.at(-1) : candidates[fields.position - 1]
  return pick === day.getDate()
}
