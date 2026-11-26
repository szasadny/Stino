import { MAX_MONTHDAY } from '../constants'
import { WEEKDAY_INDEXES, WEEKDAY_NAMES, WEEKDAYS } from '../date'
import {
  CUSTOM,
  DAILY,
  DOES_NOT_REPEAT,
  MONTHLY,
  ON_A_DATE,
  ON_A_WEEKDAY,
  ORDINAL_FIFTH,
  ORDINAL_FIRST,
  ORDINAL_FOURTH,
  ORDINAL_LAST,
  ORDINAL_SECOND,
  ORDINAL_THIRD,
  UNIT_DAYS,
  UNIT_MONTHS,
  UNIT_WEEKS,
  WEEKLY,
  WORKDAY,
  YEARLY,
} from '../messages'
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
  { value: 'daily', label: DAILY },
  { value: 'weekly', label: WEEKLY },
  { value: 'monthly', label: MONTHLY },
  { value: 'yearly', label: YEARLY },
  { value: 'custom', label: CUSTOM },
]

export const CUSTOM_UNIT_OPTIONS: { value: CustomUnit; label: string }[] = [
  { value: 'day', label: UNIT_DAYS },
  { value: 'week', label: UNIT_WEEKS },
  { value: 'month', label: UNIT_MONTHS },
]

export const MONTHLY_MODE_OPTIONS: { value: MonthlyMode; label: string }[] = [
  { value: 'monthday', label: ON_A_DATE },
  { value: 'weekday', label: ON_A_WEEKDAY },
]

export const MONTHDAY_OPTIONS: number[] = Array.from({ length: MAX_MONTHDAY }, (_, i) => i + 1)

export const WEEKDAY_OPTIONS: { code: WeekdayCode; label: string }[] = WEEKDAY_INDEXES.map((i) => ({
  code: WEEKDAY_CODES[i],
  label: WEEKDAYS[i],
}))

export const MONTH_WEEKDAY_OPTIONS: { code: MonthWeekday; label: string }[] = [
  { code: WORKDAY_CODE, label: WORKDAY },
  ...WEEKDAY_INDEXES.map((i) => ({ code: WEEKDAY_CODES[i], label: WEEKDAY_NAMES[i] })),
]

export const ORDINAL_OPTIONS: { value: OrdinalPosition; label: string }[] = [
  { value: 1, label: ORDINAL_FIRST },
  { value: 2, label: ORDINAL_SECOND },
  { value: 3, label: ORDINAL_THIRD },
  { value: 4, label: ORDINAL_FOURTH },
  { value: 5, label: ORDINAL_FIFTH },
  { value: -1, label: ORDINAL_LAST },
]

export function positionLabel(position: OrdinalPosition): string {
  return ORDINAL_OPTIONS.find((o) => o.value === position)?.label ?? String(position)
}

export function weekdayLabel(code: WeekdayCode): string {
  return WEEKDAY_OPTIONS.find((d) => d.code === code)?.label ?? code
}

export function monthWeekdayLabel(code: MonthWeekday): string {
  return code === WORKDAY_CODE ? WORKDAY.toLowerCase() : weekdayLabel(code)
}
