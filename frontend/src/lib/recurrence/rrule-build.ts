import { toRRuleDate } from '../date'
import {
  WORKDAY_CODE,
  WORKDAYS,
  normalizeInterval,
  orderWeekdays,
  type MonthlyFields,
  type RecurrenceValue,
  type WeekdayCode,
} from './model'

export function buildRRule(value: RecurrenceValue): string | null {
  const base = buildBase(value)
  if (!base) return null
  // Bare-date UNTIL like TickTick; the backend promotes it to the UTC date-time `rrule` needs.
  return value.until ? `${base};UNTIL=${toRRuleDate(value.until)}` : base
}

function buildBase(value: RecurrenceValue): string | null {
  switch (value.freq) {
    case 'none':
      return null
    case 'daily':
      return 'FREQ=DAILY'
    case 'weekly':
      return `FREQ=WEEKLY${bydayPart(value.weekdays)}`
    case 'monthly':
      return `FREQ=MONTHLY;${monthlyParts(value)}`
    case 'yearly':
      return 'FREQ=YEARLY'
    case 'custom': {
      const interval = normalizeInterval(value.interval)
      if (value.unit === 'month') return `FREQ=MONTHLY;INTERVAL=${interval};${monthlyParts(value)}`
      if (value.unit === 'week')
        return `FREQ=WEEKLY;INTERVAL=${interval}${bydayPart(value.weekdays)}`
      return `FREQ=DAILY;INTERVAL=${interval}`
    }
  }
}

// No weekday chosen ⇒ no BYDAY, so a plain weekly rule repeats on the start day.
function bydayPart(weekdays: readonly WeekdayCode[]): string {
  const days = orderWeekdays(weekdays)
  return days.length ? `;BYDAY=${days.join(',')}` : ''
}

function monthlyParts(value: MonthlyFields): string {
  if (value.monthlyMode !== 'weekday') return `BYMONTHDAY=${value.monthday}`
  const byday = value.monthWeekday === WORKDAY_CODE ? WORKDAYS.join(',') : value.monthWeekday
  return `BYDAY=${byday};BYSETPOS=${value.position}`
}
