import { fromRRuleDate } from '../date'
import {
  EMPTY_MONTHLY,
  EMPTY_RECURRENCE,
  WEEKDAY_CODES,
  WORKDAY_CODE,
  isMonthday,
  isOrdinalPosition,
  isWeekdayCode,
  isWorkdaySet,
  orderWeekdays,
  type MonthlyFields,
  type OrdinalPosition,
  type RecurrenceValue,
  type WeekdayCode,
} from './model'

// RFC-5545 also allows `1MO`/`-1FR` instead of a separate BYSETPOS.
const ORDINAL_DAY = new RegExp(`^(?<position>[+-]?\\d+)?(?<code>${WEEKDAY_CODES.join('|')})$`)

// Best effort: a rule the picker can't model maps to `none`; callers keep it read-only.
export function parseRRule(rule: string | null): RecurrenceValue {
  const base = parseBase(rule)
  if (base.freq === 'none' || !rule) return base
  const rawUntil = parseParts(rule).get('UNTIL')
  const until = rawUntil ? fromRRuleDate(rawUntil) : null
  return until ? { ...base, until } : base
}

export function isUnmodeledRule(rule: string | null): rule is string {
  return !!rule && parseRRule(rule).freq === 'none'
}

function parseParts(rule: string): Map<string, string> {
  const parts = new Map<string, string>()
  for (const segment of rule.split(';')) {
    const [key, val] = segment.split('=')
    if (key && val) parts.set(key.trim().toUpperCase(), val.trim())
  }
  return parts
}

// Null when a token isn't a plain weekday code (e.g. `1MO`), so the rule stays unmodeled.
function parseWeekdays(byday: string | undefined): WeekdayCode[] | null {
  const codes: WeekdayCode[] = []
  for (const token of byday?.split(',') ?? []) {
    const code = token.trim().toUpperCase()
    if (!isWeekdayCode(code)) return null
    codes.push(code)
  }
  return orderWeekdays(codes)
}

function parseOrdinalDay(
  token: string,
): { position: OrdinalPosition | null; code: WeekdayCode } | null {
  const groups = ORDINAL_DAY.exec(token.trim().toUpperCase())?.groups
  const code = groups?.code
  if (!code || !isWeekdayCode(code)) return null
  const position = groups?.position ? parseInt(groups.position, 10) : null
  if (position !== null && !isOrdinalPosition(position)) return null
  return { position, code }
}

// Any BY… part a shape doesn't model leaves the rule unmodeled, so a re-save can't drop it.
function parseBase(rule: string | null): RecurrenceValue {
  if (!rule) return { ...EMPTY_RECURRENCE }
  const parts = parseParts(rule)
  if (parts.has('COUNT')) return { ...EMPTY_RECURRENCE }
  const freq = parts.get('FREQ')
  const interval = parseInt(parts.get('INTERVAL') ?? '1', 10) || 1
  const byKeys = [...parts.keys()].filter((k) => k.startsWith('BY'))
  const weekdays = parseWeekdays(parts.get('BYDAY'))

  if (freq === 'DAILY' && byKeys.length === 0) {
    return interval > 1
      ? { ...EMPTY_RECURRENCE, freq: 'custom', unit: 'day', interval }
      : { ...EMPTY_RECURRENCE, freq: 'daily' }
  }
  if (freq === 'WEEKLY' && weekdays && byKeys.every((k) => k === 'BYDAY')) {
    return interval > 1
      ? { ...EMPTY_RECURRENCE, freq: 'custom', unit: 'week', interval, weekdays }
      : { ...EMPTY_RECURRENCE, freq: 'weekly', weekdays }
  }
  if (freq === 'YEARLY' && interval === 1 && byKeys.length === 0) {
    return { ...EMPTY_RECURRENCE, freq: 'yearly' }
  }
  if (freq === 'MONTHLY') {
    const shape = parseMonthlyParts(parts, weekdays ?? [])
    if (shape) {
      return interval > 1
        ? { ...EMPTY_RECURRENCE, ...shape, freq: 'custom', unit: 'month', interval }
        : { ...EMPTY_RECURRENCE, ...shape, freq: 'monthly' }
    }
  }
  return { ...EMPTY_RECURRENCE }
}

function parseMonthlyParts(
  parts: Map<string, string>,
  weekdays: WeekdayCode[],
): MonthlyFields | null {
  const byday = parts.get('BYDAY')
  const bysetpos = parts.get('BYSETPOS')
  const bymonthday = parts.get('BYMONTHDAY')
  const modeled = bymonthday ? ['BYMONTHDAY'] : ['BYDAY', 'BYSETPOS']
  if ([...parts.keys()].some((k) => k.startsWith('BY') && !modeled.includes(k))) return null
  const setpos = bysetpos ? parseInt(bysetpos, 10) : NaN
  if (isWorkdaySet(weekdays) && isOrdinalPosition(setpos)) {
    return {
      ...EMPTY_MONTHLY,
      monthlyMode: 'weekday',
      position: setpos,
      monthWeekday: WORKDAY_CODE,
    }
  }
  if (byday && !byday.includes(',')) {
    const day = parseOrdinalDay(byday)
    const position = bysetpos ? parseInt(bysetpos, 10) : (day?.position ?? null)
    if (day && position !== null && isOrdinalPosition(position)) {
      return { ...EMPTY_MONTHLY, monthlyMode: 'weekday', position, monthWeekday: day.code }
    }
  }
  if (bymonthday && !bymonthday.includes(',')) {
    const monthday = parseInt(bymonthday, 10)
    if (isMonthday(monthday)) return { ...EMPTY_MONTHLY, monthlyMode: 'monthday', monthday }
  }
  return null
}
