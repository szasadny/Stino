import { MAX_MONTHDAY } from '../constants'
import { WEEKDAY_INDEXES, WEEKDAY_NAMES, WEEKDAYS } from '../date'
import { DOES_NOT_REPEAT } from '../messages'
import {
  WEEKDAY_CODES,
  WORKDAY_CODE,
  type CustomUnit,
  type MonthWeekday,
  type MonthlyMode,
  type OrdinalPosition,
  type RecurrenceFreq,
  type WeekdayCode,
} from './model'

export const REPEAT_OPTIONS: { value: RecurrenceFreq; label: string }[] = [
  { value: 'none', label: DOES_NOT_REPEAT },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

export const CUSTOM_UNIT_OPTIONS: { value: CustomUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
]

export const MONTHLY_MODE_OPTIONS: { value: MonthlyMode; label: string }[] = [
  { value: 'monthday', label: 'On a date' },
  { value: 'weekday', label: 'On a weekday' },
]

export const MONTHDAY_OPTIONS: number[] = Array.from({ length: MAX_MONTHDAY }, (_, i) => i + 1)

export const WEEKDAY_OPTIONS: { code: WeekdayCode; label: string }[] = WEEKDAY_INDEXES.map((i) => ({
  code: WEEKDAY_CODES[i],
  label: WEEKDAYS[i],
}))

export const MONTH_WEEKDAY_OPTIONS: { code: MonthWeekday; label: string }[] = [
  { code: WORKDAY_CODE, label: 'Workday' },
  ...WEEKDAY_INDEXES.map((i) => ({ code: WEEKDAY_CODES[i], label: WEEKDAY_NAMES[i] })),
]

export const ORDINAL_OPTIONS: { value: OrdinalPosition; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: 5, label: 'Fifth' },
  { value: -1, label: 'Last' },
]

export function positionLabel(position: OrdinalPosition): string {
  return ORDINAL_OPTIONS.find((o) => o.value === position)?.label ?? String(position)
}

export function weekdayLabel(code: WeekdayCode): string {
  return WEEKDAY_OPTIONS.find((d) => d.code === code)?.label ?? code
}

export function monthWeekdayLabel(code: MonthWeekday): string {
  return code === WORKDAY_CODE ? 'workday' : weekdayLabel(code)
}
