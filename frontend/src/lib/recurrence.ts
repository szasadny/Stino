// UI recurrence options ⇄ RFC-5545 RRULE mapping; the backend validates and expands.

import { formatShortDate, fromISODate } from './date'

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export type CustomUnit = 'day' | 'week' | 'month'
export type MonthlyMode = 'monthday' | 'weekday'
/** BYSETPOS / "the Nth": 1..5 = first..fifth, -1 = last. */
export type OrdinalPosition = 1 | 2 | 3 | 4 | 5 | -1

export interface RecurrenceValue {
  freq: RecurrenceFreq
  interval: number
  unit: CustomUnit
  weekdays: string[] // empty ⇒ the start weekday
  // The monthly fields serve both Monthly and Custom every-N-months.
  monthlyMode: MonthlyMode
  monthday: number // -1 ⇒ the last day
  position: OrdinalPosition
  monthWeekday: string // a single BYDAY code, or WORKDAY_CODE
  until: string | null // local ISO date; null ⇒ never ends
}

export const WEEKDAY_OPTIONS: { code: string; label: string }[] = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
]

export const WEEKDAY_LONG: { code: string; label: string }[] = [
  { code: 'MO', label: 'Monday' },
  { code: 'TU', label: 'Tuesday' },
  { code: 'WE', label: 'Wednesday' },
  { code: 'TH', label: 'Thursday' },
  { code: 'FR', label: 'Friday' },
  { code: 'SA', label: 'Saturday' },
  { code: 'SU', label: 'Sunday' },
]

export const WORKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR']
/** Stands in for the Mon–Fri set, so BYSETPOS picks the Nth/last *workday* of the month. */
export const WORKDAY_CODE = 'WD'

export const MONTH_WEEKDAY_OPTIONS: { code: string; label: string }[] = [
  { code: WORKDAY_CODE, label: 'Workday' },
  ...WEEKDAY_LONG,
]

export const ORDINAL_OPTIONS: { value: OrdinalPosition; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: 5, label: 'Fifth' },
  { value: -1, label: 'Last' },
]

const WEEKDAY_ORDER = WEEKDAY_OPTIONS.map((d) => d.code)

export const EMPTY_RECURRENCE: RecurrenceValue = {
  freq: 'none',
  interval: 2,
  unit: 'week',
  weekdays: [],
  monthlyMode: 'monthday',
  monthday: 1,
  position: 1,
  monthWeekday: 'MO',
  until: null,
}

function isWeekdayCode(code: string): boolean {
  return WEEKDAY_ORDER.includes(code)
}

function isOrdinalPosition(n: number): n is OrdinalPosition {
  return n === -1 || (n >= 1 && n <= 5)
}

/** Expects `codes` already ordered and deduped. */
function isWorkdaySet(codes: string[]): boolean {
  return codes.length === WORKDAYS.length && codes.every((c, i) => c === WORKDAYS[i])
}

export function positionLabel(p: OrdinalPosition): string {
  return ORDINAL_OPTIONS.find((o) => o.value === p)?.label ?? String(p)
}

function orderWeekdays(codes: string[]): string[] {
  return [...new Set(codes)].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
}

/** Monthly fields matching the start date, so switching to Monthly doesn't always pick day 1. */
export function monthlyDefaultsFor(
  iso: string | null,
): Pick<RecurrenceValue, 'monthday' | 'position' | 'monthWeekday'> {
  if (!iso) {
    const { monthday, position, monthWeekday } = EMPTY_RECURRENCE
    return { monthday, position, monthWeekday }
  }
  const d = fromISODate(iso)
  const day = d.getDate()
  const code = WEEKDAY_ORDER[(d.getDay() + 6) % 7]
  const position = Math.min(5, Math.ceil(day / 7)) as OrdinalPosition
  return { monthday: day, position, monthWeekday: code }
}

export type MonthlyFields = Pick<
  RecurrenceValue,
  'monthlyMode' | 'monthday' | 'position' | 'monthWeekday'
>

const EMPTY_MONTHLY: MonthlyFields = {
  monthlyMode: EMPTY_RECURRENCE.monthlyMode,
  monthday: EMPTY_RECURRENCE.monthday,
  position: EMPTY_RECURRENCE.position,
  monthWeekday: EMPTY_RECURRENCE.monthWeekday,
}

export function buildRRule(value: RecurrenceValue): string | null {
  const base = buildBase(value)
  if (!base) return null
  // Bare-date UNTIL like TickTick; the backend promotes it to the UTC date-time `rrule` needs.
  return value.until ? `${base};UNTIL=${isoToUntil(value.until)}` : base
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
      const interval = Math.max(1, Math.floor(value.interval) || 1)
      if (value.unit === 'month') return `FREQ=MONTHLY;INTERVAL=${interval};${monthlyParts(value)}`
      if (value.unit === 'week')
        return `FREQ=WEEKLY;INTERVAL=${interval}${bydayPart(value.weekdays)}`
      return `FREQ=DAILY;INTERVAL=${interval}`
    }
  }
}

/** '' when no weekday is chosen — a plain weekly rule repeats on the start day. */
function bydayPart(weekdays: string[]): string {
  const days = orderWeekdays(weekdays)
  return days.length ? `;BYDAY=${days.join(',')}` : ''
}

function monthlyParts(value: MonthlyFields): string {
  if (value.monthlyMode !== 'weekday') return `BYMONTHDAY=${value.monthday}`
  const byday = value.monthWeekday === WORKDAY_CODE ? WORKDAYS.join(',') : value.monthWeekday
  return `BYDAY=${byday};BYSETPOS=${value.position}`
}

function isoToUntil(iso: string): string {
  return iso.replace(/-/g, '')
}

/** Accepts both the DATE and DATE-TIME forms of UNTIL. */
function untilToISO(raw: string | undefined): string | null {
  const m = raw?.trim().match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function parseParts(rule: string): Map<string, string> {
  const parts = new Map<string, string>()
  for (const segment of rule.split(';')) {
    const [key, val] = segment.split('=')
    if (key && val) parts.set(key.trim().toUpperCase(), val.trim())
  }
  return parts
}

/** RFC-5545 also allows `1MO`/`-1FR` instead of a separate BYSETPOS. */
function parseOrdinalDay(token: string): { position: OrdinalPosition | null; code: string } | null {
  const m = token
    .trim()
    .toUpperCase()
    .match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/)
  if (!m) return null
  const pos = m[1] ? parseInt(m[1], 10) : null
  if (pos !== null && !isOrdinalPosition(pos)) return null
  return { position: pos, code: m[2] }
}

/** Best effort: an unmodeled rule (two dates, COUNT, …) maps to `none`; callers keep it read-only. */
export function parseRRule(rule: string | null): RecurrenceValue {
  const base = parseBase(rule)
  if (base.freq === 'none' || !rule) return base
  const until = untilToISO(parseParts(rule).get('UNTIL'))
  return until ? { ...base, until } : base
}

function parseBase(rule: string | null): RecurrenceValue {
  if (!rule) return { ...EMPTY_RECURRENCE }
  const parts = parseParts(rule)
  if (parts.has('COUNT')) return { ...EMPTY_RECURRENCE }
  const freq = parts.get('FREQ')
  const interval = parseInt(parts.get('INTERVAL') ?? '1', 10) || 1
  const byday = parts.get('BYDAY')
  const weekdays = byday
    ? orderWeekdays(
        byday
          .split(',')
          .map((d) => d.trim().toUpperCase())
          .filter(isWeekdayCode),
      )
    : []

  if (freq === 'DAILY') {
    return interval > 1
      ? { ...EMPTY_RECURRENCE, freq: 'custom', unit: 'day', interval }
      : { ...EMPTY_RECURRENCE, freq: 'daily' }
  }
  if (freq === 'WEEKLY') {
    if (interval > 1) {
      return { ...EMPTY_RECURRENCE, freq: 'custom', unit: 'week', interval, weekdays }
    }
    return { ...EMPTY_RECURRENCE, freq: 'weekly', weekdays }
  }
  // A yearly rule with BY… parts or an interval stays unmodeled.
  if (freq === 'YEARLY' && interval === 1 && ![...parts.keys()].some((k) => k.startsWith('BY'))) {
    return { ...EMPTY_RECURRENCE, freq: 'yearly' }
  }
  if (freq === 'MONTHLY') {
    const shape = parseMonthlyParts(parts, byday, weekdays)
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
  byday: string | undefined,
  weekdays: string[],
): MonthlyFields | null {
  const bysetpos = parts.get('BYSETPOS')
  const bymonthday = parts.get('BYMONTHDAY')
  // A mixed shape (e.g. Friday the 13th) stays unmodeled so re-saving can't drop a part.
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
    const od = parseOrdinalDay(byday)
    const pos = bysetpos ? parseInt(bysetpos, 10) : (od?.position ?? null)
    if (od && pos !== null && isOrdinalPosition(pos)) {
      return { ...EMPTY_MONTHLY, monthlyMode: 'weekday', position: pos, monthWeekday: od.code }
    }
  }
  if (bymonthday && !bymonthday.includes(',')) {
    const n = parseInt(bymonthday, 10)
    if (!Number.isNaN(n) && (n === -1 || (n >= 1 && n <= 31))) {
      return { ...EMPTY_MONTHLY, monthlyMode: 'monthday', monthday: n }
    }
  }
  return null
}

function codeLabel(code: string): string {
  return WEEKDAY_OPTIONS.find((d) => d.code === code)?.label ?? code
}

function monthWeekdayLabel(code: string): string {
  return code === WORKDAY_CODE ? 'workday' : codeLabel(code)
}

export function summarize(value: RecurrenceValue): string {
  const base = summarizeBase(value)
  if (value.freq === 'none' || !value.until) return base
  return `${base} until ${formatShortDate(fromISODate(value.until))}`
}

function summarizeBase(value: RecurrenceValue): string {
  switch (value.freq) {
    case 'none':
      return 'Does not repeat'
    case 'daily':
      return 'Every day'
    case 'weekly': {
      if (!value.weekdays.length) return 'Every week'
      const days = orderWeekdays(value.weekdays)
      if (isWorkdaySet(days)) return 'Every weekday'
      return `Weekly on ${days.map(codeLabel).join(', ')}`
    }
    case 'monthly':
      return `Monthly ${monthlyOn(value)}`
    case 'yearly':
      return 'Every year'
    case 'custom': {
      const unit = value.unit
      const every = value.interval === 1 ? `Every ${unit}` : `Every ${value.interval} ${unit}s`
      if (unit === 'month') return `${every} ${monthlyOn(value)}`
      return unit === 'week' && value.weekdays.length
        ? `${every} ${weeklyOn(value.weekdays)}`
        : every
    }
  }
}

function weeklyOn(weekdays: string[]): string {
  const days = orderWeekdays(weekdays)
  return isWorkdaySet(days) ? 'on weekdays' : `on ${days.map(codeLabel).join(', ')}`
}

function monthlyOn(value: MonthlyFields): string {
  if (value.monthlyMode === 'weekday') {
    return `on the ${positionLabel(value.position).toLowerCase()} ${monthWeekdayLabel(value.monthWeekday)}`
  }
  return value.monthday === -1 ? 'on the last day' : `on day ${value.monthday}`
}

export function summarizeRule(rule: string | null): string {
  if (isUnmodeledRule(rule)) return 'Custom repeat'
  return summarize(parseRRule(rule))
}

/** The picker can't represent it, so keep it verbatim and read-only. */
export function isUnmodeledRule(rule: string | null): rule is string {
  return !!rule && parseRRule(rule).freq === 'none'
}

export interface RecurrenceMatch {
  rule: string
  matched: string
}

const ORDINAL_WORDS: Record<string, OrdinalPosition> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  last: -1,
}

const WEEKDAY_NAMES: Record<string, string> = {
  monday: 'MO',
  mon: 'MO',
  tuesday: 'TU',
  tues: 'TU',
  tue: 'TU',
  wednesday: 'WE',
  wed: 'WE',
  thursday: 'TH',
  thurs: 'TH',
  thur: 'TH',
  thu: 'TH',
  friday: 'FR',
  fri: 'FR',
  saturday: 'SA',
  sat: 'SA',
  sunday: 'SU',
  sun: 'SU',
}

const WEEKDAY_ALT = Object.keys(WEEKDAY_NAMES).join('|')
const ORDINAL_ALT = 'first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last'
// "mon, wed and fri" / "tuesdays & thursdays"
const WEEKDAY_LIST = `(?:${WEEKDAY_ALT})s?(?:(?:\\s*,\\s*(?:and\\s+)?|\\s*&\\s*|\\s+and\\s+)(?:${WEEKDAY_ALT})s?)*`
const WORKDAY_WORD = '(?:work(?:ing)?\\s?day|business\\s+day)'
// Each fragment captures one optional count group ("3" / "other"; absent ⇒ 1).
const EVERY_DAY = '(?:every\\s+(?:(\\d+|other)\\s+days?|day)|daily)'
const EVERY_WEEK = '(?:every\\s+(?:(\\d+|other)\\s+weeks?|week)|weekly)'
const EVERY_MONTH = '(?:every\\s+(?:(\\d+|other)\\s+months?|month)|monthly)'
const OF_EVERY_MONTH = `(?:of\\s+(?:each|the)\\s+month|(?:of\\s+)?${EVERY_MONTH})`

type PhraseValue = (m: RegExpExecArray, start: string | null) => RecurrenceValue | null

// Ordered most-specific first; the first matching pattern wins.
const PHRASE_RULES: { re: RegExp; value: PhraseValue }[] = [
  // "(the) first Monday of every (other) month"
  {
    re: new RegExp(
      `\\b(?:the\\s+)?(${ORDINAL_ALT})\\s+(${WEEKDAY_ALT})\\s+${OF_EVERY_MONTH}\\b`,
      'i',
    ),
    value: (m) => monthlyWeekday(m[1], m[2], m[3]),
  },
  // "every (N) month(s)/monthly on the first Monday"
  {
    re: new RegExp(
      `\\b${EVERY_MONTH}\\s+on\\s+the\\s+(${ORDINAL_ALT})\\s+(${WEEKDAY_ALT})\\b`,
      'i',
    ),
    value: (m) => monthlyWeekday(m[2], m[3], m[1]),
  },
  // "(the) first/last workday of every month" (work day / business day too)
  {
    re: new RegExp(`\\b(?:the\\s+)?(first|last)\\s+${WORKDAY_WORD}\\s+${OF_EVERY_MONTH}\\b`, 'i'),
    value: (m) => monthlyWorkday(m[1], m[2]),
  },
  // "every (N) month(s)/monthly on the first/last workday"
  {
    re: new RegExp(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+(first|last)\\s+${WORKDAY_WORD}\\b`, 'i'),
    value: (m) => monthlyWorkday(m[2], m[1]),
  },
  // "(the) first/last day of every month"
  {
    re: new RegExp(`\\b(?:the\\s+)?(first|last)\\s+day\\s+${OF_EVERY_MONTH}\\b`, 'i'),
    value: (m) => monthlyMonthday(firstOrLast(m[1]), m[2]),
  },
  // "every (N) month(s)/monthly on the first/last day"
  {
    re: new RegExp(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+(first|last)\\s+day\\b`, 'i'),
    value: (m) => monthlyMonthday(firstOrLast(m[2]), m[1]),
  },
  // "the 15th of every month"; a bare number needs "the" or a suffix so "buy 2 every month" isn't a date
  {
    re: new RegExp(
      `\\b(?:the\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th))\\s+${OF_EVERY_MONTH}\\b`,
      'i',
    ),
    value: (m) => monthlyMonthday(Number(m[1] ?? m[2]), m[3]),
  },
  // "every (N) month(s)/monthly on the 15th"
  {
    re: new RegExp(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'),
    value: (m) => monthlyMonthday(Number(m[2]), m[1]),
  },
  // "(the) first/last day of every/each week"
  {
    re: /\b(?:the\s+)?(first|last)\s+day\s+of\s+(?:every|each|the)\s+week\b/i,
    value: (m) => ({
      ...EMPTY_RECURRENCE,
      freq: 'weekly',
      weekdays: [m[1].toLowerCase() === 'last' ? 'SU' : 'MO'],
    }),
  },
  // "every weekday" / "every workday" / "every business day" ⇒ weekly Mon–Fri
  {
    re: /\bevery\s+(?:week\s?day|work(?:ing)?\s?day|business\s+day)\b/i,
    value: () => ({ ...EMPTY_RECURRENCE, freq: 'weekly', weekdays: [...WORKDAYS] }),
  },
  // "every (other) Monday" / "every mon and wed"
  {
    re: new RegExp(`\\bevery\\s+(?:(\\d+|other)\\s+)?(${WEEKDAY_LIST})\\b`, 'i'),
    value: (m) => repeatWeekly(m[1], m[2]),
  },
  // "every (N) day(s)" / "daily"
  {
    re: new RegExp(`\\b${EVERY_DAY}\\b`, 'i'),
    value: (m) => repeatEvery('day', m[1], {}),
  },
  // "every year" / "yearly" / "annually"
  {
    re: /\b(?:every\s+year|yearly|annually)\b/i,
    value: () => ({ ...EMPTY_RECURRENCE, freq: 'yearly' }),
  },
  // "every (N) week(s)/weekly (on mon and wed)"
  {
    re: new RegExp(`\\b${EVERY_WEEK}\\b(?:\\s+on\\s+(${WEEKDAY_LIST})\\b)?`, 'i'),
    value: (m) => repeatWeekly(m[1], m[2]),
  },
  // bare "every (N) month(s)" ⇒ the start date's day of the month
  {
    re: new RegExp(`\\b${EVERY_MONTH}\\b`, 'i'),
    value: (m, start) => monthlyMonthday(monthlyDefaultsFor(start).monthday, m[1]),
  },
]

/** "other" ⇒ 2; null when not a positive count. */
function intervalOf(count: string | undefined): number | null {
  if (!count) return 1
  const n = count.toLowerCase() === 'other' ? 2 : Number(count)
  return n >= 1 ? n : null
}

/** Interval 1 is the plain frequency; a larger one is the picker's Custom every-N-units. */
function repeatEvery(
  unit: CustomUnit,
  count: string | undefined,
  fields: Partial<RecurrenceValue>,
): RecurrenceValue | null {
  const interval = intervalOf(count)
  if (interval === null) return null
  const freq = interval > 1 ? 'custom' : UNIT_FREQ[unit]
  return { ...EMPTY_RECURRENCE, ...fields, freq, unit, interval }
}

const UNIT_FREQ: Record<CustomUnit, RecurrenceFreq> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
}

function repeatWeekly(count: string | undefined, list: string | undefined): RecurrenceValue | null {
  const weekdays: string[] = []
  for (const word of list?.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (word === 'and') continue
    const code = WEEKDAY_NAMES[word] ?? WEEKDAY_NAMES[word.replace(/s$/, '')]
    if (!code) return null
    weekdays.push(code)
  }
  return repeatEvery('week', count, { weekdays })
}

function firstOrLast(word: string): OrdinalPosition {
  return word.toLowerCase() === 'last' ? -1 : 1
}

function monthlyWeekday(
  ordinal: string,
  weekday: string,
  count: string | undefined,
): RecurrenceValue | null {
  const position = ORDINAL_WORDS[ordinal.toLowerCase()]
  const code = WEEKDAY_NAMES[weekday.toLowerCase()]
  if (position === undefined || !code) return null
  return repeatEvery('month', count, { monthlyMode: 'weekday', position, monthWeekday: code })
}

function monthlyMonthday(day: number, count: string | undefined): RecurrenceValue | null {
  if (day !== -1 && (day < 1 || day > 31)) return null
  return repeatEvery('month', count, { monthlyMode: 'monthday', monthday: day })
}

function monthlyWorkday(ordinal: string, count: string | undefined): RecurrenceValue | null {
  return repeatEvery('month', count, {
    monthlyMode: 'weekday',
    position: firstOrLast(ordinal),
    monthWeekday: WORKDAY_CODE,
  })
}

/** `matched` is the substring to strip from the title; `start` anchors a bare "every month". */
export function parseRecurrencePhrase(
  text: string,
  start: string | null = null,
): RecurrenceMatch | null {
  for (const { re, value } of PHRASE_RULES) {
    const m = re.exec(text)
    if (!m) continue
    const built = value(m, start)
    const rule = built && buildRRule(built)
    if (rule) return { rule, matched: m[0] }
  }
  return null
}
