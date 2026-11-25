import { formatShortDate } from '../date'
import { pluralize } from '../format'
import { DOES_NOT_REPEAT } from '../messages'
import {
  FIFTH_POSITION,
  SHORTEST_MONTH_DAYS,
  WORKDAY_CODE,
  isWorkdaySet,
  normalizeInterval,
  orderWeekdays,
  type MonthlyFields,
  type RecurrenceValue,
  type WeekdayCode,
} from './model'
import { monthWeekdayLabel, positionLabel, weekdayLabel } from './options'
import { isUnmodeledRule, parseRRule } from './rrule-parse'

export function summarize(value: RecurrenceValue): string {
  const base = summarizeBase(value)
  if (value.freq === 'none' || !value.until) return base
  return `${base} until ${formatShortDate(value.until)}`
}

export function summarizeRule(rule: string | null): string {
  if (isUnmodeledRule(rule)) return 'Custom repeat'
  return summarize(parseRRule(rule))
}

function summarizeBase(value: RecurrenceValue): string {
  switch (value.freq) {
    case 'none':
      return DOES_NOT_REPEAT
    case 'daily':
      return 'Every day'
    case 'weekly':
      if (!value.weekdays.length) return 'Every week'
      if (isWorkdaySet(orderWeekdays(value.weekdays))) return 'Every weekday'
      return `Weekly ${weeklyOn(value.weekdays)}`
    case 'monthly':
      return `Monthly ${monthlyOn(value)}`
    case 'yearly':
      return 'Every year'
    case 'custom': {
      const interval = normalizeInterval(value.interval)
      const every =
        interval === 1 ? `Every ${value.unit}` : `Every ${pluralize(interval, value.unit)}`
      if (value.unit === 'month') return `${every} ${monthlyOn(value)}`
      return value.unit === 'week' && value.weekdays.length
        ? `${every} ${weeklyOn(value.weekdays)}`
        : every
    }
  }
}

function weeklyOn(weekdays: readonly WeekdayCode[]): string {
  const days = orderWeekdays(weekdays)
  return isWorkdaySet(days) ? 'on weekdays' : `on ${days.map(weekdayLabel).join(', ')}`
}

function monthlyOn(value: MonthlyFields): string {
  if (value.monthlyMode === 'weekday') {
    return `on the ${positionLabel(value.position).toLowerCase()} ${monthWeekdayLabel(value.monthWeekday)}`
  }
  return value.monthday === -1 ? 'on the last day' : `on day ${value.monthday}`
}

export function monthlySkipNote(value: MonthlyFields): string | null {
  if (value.monthlyMode === 'monthday') {
    return value.monthday > SHORTEST_MONTH_DAYS ? 'Months without this day are skipped.' : null
  }
  return value.position === FIFTH_POSITION && value.monthWeekday !== WORKDAY_CODE
    ? 'Months without a fifth one are skipped.'
    : null
}
