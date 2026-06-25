// The one place that maps the small set of UI recurrence options to/from an
// RFC-5545 RRULE string. The backend is the source of truth for *validating* and
// *expanding* a rule (via the `rrule` crate); this presentation helper only
// builds the rule the picker emits and parses one back so an existing task's
// rule can populate the picker. Keep the option⇄RRULE mapping here, not inlined
// in components.

import { formatShortDate, fromISODate } from './date'

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
export type CustomUnit = 'day' | 'week'
/** Monthly repeats either on a date-number, or on the Nth weekday. */
export type MonthlyMode = 'monthday' | 'weekday'
/** BYSETPOS / "the Nth": 1..5 = first..fifth, -1 = last. */
export type OrdinalPosition = 1 | 2 | 3 | 4 | 5 | -1

/** The picker's structured form. `none` ⇒ the task does not repeat. */
export interface RecurrenceValue {
  freq: RecurrenceFreq
  interval: number // custom: every N units (≥ 1)
  unit: CustomUnit // custom: days or weeks
  weekdays: string[] // weekly: RRULE day codes, e.g. ['MO','WE']; empty ⇒ the start weekday
  monthlyMode: MonthlyMode // monthly: by date-number vs by Nth weekday
  monthday: number // monthly/monthday: 1..31, or -1 ⇒ the last day
  position: OrdinalPosition // monthly/weekday: which occurrence (BYSETPOS)
  monthWeekday: string // monthly/weekday: a single BYDAY code, e.g. 'MO'
  until: string | null // local end date (RRULE UNTIL), ISO YYYY-MM-DD; null ⇒ never ends
}

/** RRULE weekday codes in week order, with short labels for the toggles. */
export const WEEKDAY_OPTIONS: { code: string; label: string }[] = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
]

/** Full weekday names in week order — for the monthly "Nth weekday" select. */
export const WEEKDAY_LONG: { code: string; label: string }[] = [
  { code: 'MO', label: 'Monday' },
  { code: 'TU', label: 'Tuesday' },
  { code: 'WE', label: 'Wednesday' },
  { code: 'TH', label: 'Thursday' },
  { code: 'FR', label: 'Friday' },
  { code: 'SA', label: 'Saturday' },
  { code: 'SU', label: 'Sunday' },
]

/** The Monday–Friday set, in week order, expanded by the monthly "workday" option. */
export const WORKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR']
/**
 * Sentinel `monthWeekday` value for the monthly "first/last workday" option: it
 * stands in for the whole Mon–Fri set, so the Nth-weekday machinery (BYSETPOS)
 * yields the first/Nth/last *workday* of the month (`BYDAY=MO,TU,WE,TH,FR`).
 */
export const WORKDAY_CODE = 'WD'

/** Options for the monthly "Nth weekday" select: the workday set, then each weekday. */
export const MONTH_WEEKDAY_OPTIONS: { code: string; label: string }[] = [
  { code: WORKDAY_CODE, label: 'Workday' },
  ...WEEKDAY_LONG,
]

/** Ordinal positions for the monthly "Nth weekday" select — the one source. */
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

/** True when `codes` is exactly the Mon–Fri set (already ordered & deduped). */
function isWorkdaySet(codes: string[]): boolean {
  return codes.length === WORKDAYS.length && codes.every((c, i) => c === WORKDAYS[i])
}

/** Label for an ordinal position, e.g. 1 → "First", -1 → "Last". */
export function positionLabel(p: OrdinalPosition): string {
  return ORDINAL_OPTIONS.find((o) => o.value === p)?.label ?? String(p)
}

/** Sort weekday codes into canonical Monday-first order for stable output. */
function orderWeekdays(codes: string[]): string[] {
  return [...new Set(codes)].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
}

/**
 * Sensible monthly defaults derived from a task's start date: the day-of-month
 * and the Nth-weekday it falls on, so switching to "Monthly" pre-selects
 * something matching the chosen date instead of always day 1. Pure (kept here,
 * out of the component).
 */
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

/** Build the RRULE string for a structured value, or null when it doesn't repeat. */
export function buildRRule(value: RecurrenceValue): string | null {
  const base = buildBase(value)
  if (!base) return null
  // An end date is the bare-date `UNTIL=YYYYMMDD` TickTick uses; the backend
  // promotes it to the UTC date-time the `rrule` crate needs (see recurrence.rs).
  return value.until ? `${base};UNTIL=${isoToUntil(value.until)}` : base
}

/** The FREQ/BY… body of the rule, without the optional UNTIL end date. */
function buildBase(value: RecurrenceValue): string | null {
  switch (value.freq) {
    case 'none':
      return null
    case 'daily':
      return 'FREQ=DAILY'
    case 'weekly': {
      const days = orderWeekdays(value.weekdays)
      // No weekday chosen ⇒ a plain weekly rule, which repeats on the start day.
      return days.length ? `FREQ=WEEKLY;BYDAY=${days.join(',')}` : 'FREQ=WEEKLY'
    }
    case 'monthly': {
      if (value.monthlyMode !== 'weekday') return `FREQ=MONTHLY;BYMONTHDAY=${value.monthday}`
      // "Workday" stands in for the whole Mon–Fri set; any real weekday is itself.
      const byday = value.monthWeekday === WORKDAY_CODE ? WORKDAYS.join(',') : value.monthWeekday
      return `FREQ=MONTHLY;BYDAY=${byday};BYSETPOS=${value.position}`
    }
    case 'custom': {
      const freq = value.unit === 'week' ? 'WEEKLY' : 'DAILY'
      const interval = Math.max(1, Math.floor(value.interval) || 1)
      return `FREQ=${freq};INTERVAL=${interval}`
    }
  }
}

/** ISO `YYYY-MM-DD` → RRULE `YYYYMMDD` (the DATE form). */
function isoToUntil(iso: string): string {
  return iso.replace(/-/g, '')
}

/** RRULE `UNTIL` (`YYYYMMDD` or `YYYYMMDDT…`) → ISO `YYYY-MM-DD`, or null. */
function untilToISO(raw: string | undefined): string | null {
  const m = raw?.trim().match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Split an RRULE into its `KEY=VALUE` parts (upper-cased keys). */
function parseParts(rule: string): Map<string, string> {
  const parts = new Map<string, string>()
  for (const segment of rule.split(';')) {
    const [key, val] = segment.split('=')
    if (key && val) parts.set(key.trim().toUpperCase(), val.trim())
  }
  return parts
}

/**
 * Parse a single BYDAY token, optionally carrying a leading signed ordinal
 * (RFC-5545 also allows `1MO`/`-1FR` instead of a separate BYSETPOS). Returns
 * the day code and the embedded position (null when there's no prefix).
 */
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

/**
 * Parse an RRULE back into the picker's structured form (best effort). A rule we
 * don't model (e.g. a monthly rule with an interval, or a multi-day list) maps
 * to `none`; callers should keep the original string and treat it as read-only
 * rather than overwrite it — see [[RecurrencePicker]]. An `UNTIL` end date is
 * carried onto any modeled rule so editing a "repeat until" task keeps its end.
 */
export function parseRRule(rule: string | null): RecurrenceValue {
  const base = parseBase(rule)
  if (base.freq === 'none' || !rule) return base
  const until = untilToISO(parseParts(rule).get('UNTIL'))
  return until ? { ...base, until } : base
}

/** The FREQ/BY… shape, ignoring any UNTIL (applied by [`parseRRule`]). */
function parseBase(rule: string | null): RecurrenceValue {
  if (!rule) return { ...EMPTY_RECURRENCE }
  const parts = parseParts(rule)
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
  // Monthly: only the shapes the picker models, and only at interval 1.
  if (freq === 'MONTHLY' && interval === 1) {
    const bysetpos = parts.get('BYSETPOS')
    const bymonthday = parts.get('BYMONTHDAY')
    const setpos = bysetpos ? parseInt(bysetpos, 10) : NaN
    // Workday: the full Mon–Fri BYDAY set plus a position ⇒ first/Nth/last workday.
    if (isWorkdaySet(weekdays) && isOrdinalPosition(setpos)) {
      return {
        ...EMPTY_RECURRENCE,
        freq: 'monthly',
        monthlyMode: 'weekday',
        position: setpos,
        monthWeekday: WORKDAY_CODE,
      }
    }
    // Nth weekday: a single BYDAY (possibly `1MO`-style) plus a position.
    if (byday && !byday.includes(',')) {
      const od = parseOrdinalDay(byday)
      const pos = bysetpos ? parseInt(bysetpos, 10) : (od?.position ?? null)
      if (od && pos !== null && isOrdinalPosition(pos)) {
        return {
          ...EMPTY_RECURRENCE,
          freq: 'monthly',
          monthlyMode: 'weekday',
          position: pos,
          monthWeekday: od.code,
        }
      }
    }
    // Date of month: a single BYMONTHDAY value (incl. -1 = last day).
    if (bymonthday && !bymonthday.includes(',')) {
      const n = parseInt(bymonthday, 10)
      if (!Number.isNaN(n) && (n === -1 || (n >= 1 && n <= 31))) {
        return { ...EMPTY_RECURRENCE, freq: 'monthly', monthlyMode: 'monthday', monthday: n }
      }
    }
  }
  return { ...EMPTY_RECURRENCE }
}

function codeLabel(code: string): string {
  return WEEKDAY_OPTIONS.find((d) => d.code === code)?.label ?? code
}

/** Like [`codeLabel`] but renders the monthly workday sentinel as "workday". */
function monthWeekdayLabel(code: string): string {
  return code === WORKDAY_CODE ? 'workday' : codeLabel(code)
}

/** A short human summary of a structured value, e.g. "Weekly on Mon, Wed". */
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
      if (value.monthlyMode === 'weekday') {
        return `Monthly on the ${positionLabel(value.position).toLowerCase()} ${monthWeekdayLabel(value.monthWeekday)}`
      }
      return value.monthday === -1 ? 'Monthly on the last day' : `Monthly on day ${value.monthday}`
    case 'custom': {
      const unit = value.unit === 'week' ? 'week' : 'day'
      return value.interval === 1 ? `Every ${unit}` : `Every ${value.interval} ${unit}s`
    }
  }
}

/** A short summary straight from a stored RRULE string (for read-only badges). */
export function summarizeRule(rule: string | null): string {
  return summarize(parseRRule(rule))
}

// --- Natural-language quick-add parsing ------------------------------------
// Recognize a recurrence phrase typed in quick-add ("first Monday of every
// month", "the 15th of every month") and turn it into an RRULE. Rule-based, not
// chrono — chrono only does one-off dates. Every match runs through buildRRule
// so RRULE strings are never hand-assembled outside it.

/** A recurrence found in free text: the rule plus the exact substring to strip. */
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

// Ordered most-specific first; the first matching pattern wins.
const PHRASE_RULES: { re: RegExp; value: (m: RegExpExecArray) => RecurrenceValue | null }[] = [
  // "(the) first Monday of every/each month"
  {
    re: new RegExp(
      `\\b(?:the\\s+)?(${ORDINAL_ALT})\\s+(${WEEKDAY_ALT})\\s+of\\s+(?:every|each|the)\\s+month\\b`,
      'i',
    ),
    value: (m) => monthlyWeekday(m[1], m[2]),
  },
  // "every month/monthly on the first Monday"
  {
    re: new RegExp(
      `\\b(?:every\\s+month|monthly)\\s+on\\s+the\\s+(${ORDINAL_ALT})\\s+(${WEEKDAY_ALT})\\b`,
      'i',
    ),
    value: (m) => monthlyWeekday(m[1], m[2]),
  },
  // "(the) first/last workday of every/each month" (work day / business day too)
  {
    re: /\b(?:the\s+)?(first|last)\s+(?:work(?:ing)?\s?day|business\s+day)\s+of\s+(?:every|each|the)\s+month\b/i,
    value: (m) => monthlyWorkday(m[1].toLowerCase() === 'last' ? -1 : 1),
  },
  // "every month/monthly on the first/last workday"
  {
    re: /\b(?:every\s+month|monthly)\s+on\s+the\s+(first|last)\s+(?:work(?:ing)?\s?day|business\s+day)\b/i,
    value: (m) => monthlyWorkday(m[1].toLowerCase() === 'last' ? -1 : 1),
  },
  // "(the) first/last day of every/each month"
  {
    re: /\b(?:the\s+)?(first|last)\s+day\s+of\s+(?:every|each|the)\s+month\b/i,
    value: (m) => monthlyMonthday(m[1].toLowerCase() === 'last' ? -1 : 1),
  },
  // "every month/monthly on the first/last day"
  {
    re: /\b(?:every\s+month|monthly)\s+on\s+the\s+(first|last)\s+day\b/i,
    value: (m) => monthlyMonthday(m[1].toLowerCase() === 'last' ? -1 : 1),
  },
  // "(the) 15th of every/each month"
  {
    re: /\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(?:every|each|the)\s+month\b/i,
    value: (m) => monthlyMonthday(Number(m[1])),
  },
  // "every month/monthly on the 15th"
  {
    re: /\b(?:every\s+month|monthly)\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
    value: (m) => monthlyMonthday(Number(m[1])),
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
  // "every Monday"
  {
    re: new RegExp(`\\bevery\\s+(${WEEKDAY_ALT})\\b`, 'i'),
    value: (m) => {
      const code = WEEKDAY_NAMES[m[1].toLowerCase()]
      return code ? { ...EMPTY_RECURRENCE, freq: 'weekly', weekdays: [code] } : null
    },
  },
  // "every day" / "daily"
  { re: /\b(?:every\s+day|daily)\b/i, value: () => ({ ...EMPTY_RECURRENCE, freq: 'daily' }) },
  // "every week" / "weekly"
  { re: /\b(?:every\s+week|weekly)\b/i, value: () => ({ ...EMPTY_RECURRENCE, freq: 'weekly' }) },
]

function monthlyWeekday(ordinal: string, weekday: string): RecurrenceValue | null {
  const position = ORDINAL_WORDS[ordinal.toLowerCase()]
  const code = WEEKDAY_NAMES[weekday.toLowerCase()]
  if (position === undefined || !code) return null
  return {
    ...EMPTY_RECURRENCE,
    freq: 'monthly',
    monthlyMode: 'weekday',
    position,
    monthWeekday: code,
  }
}

function monthlyMonthday(day: number): RecurrenceValue | null {
  if (day !== -1 && (day < 1 || day > 31)) return null
  return { ...EMPTY_RECURRENCE, freq: 'monthly', monthlyMode: 'monthday', monthday: day }
}

function monthlyWorkday(position: OrdinalPosition): RecurrenceValue {
  return {
    ...EMPTY_RECURRENCE,
    freq: 'monthly',
    monthlyMode: 'weekday',
    position,
    monthWeekday: WORKDAY_CODE,
  }
}

/**
 * Find a recurrence phrase in free text. Returns the RRULE and the matched
 * substring (so the caller can strip it from the title) or null when none is
 * found. Patterns are tried most-specific first.
 */
export function parseRecurrencePhrase(text: string): RecurrenceMatch | null {
  for (const { re, value } of PHRASE_RULES) {
    const m = re.exec(text)
    if (!m) continue
    const built = value(m)
    const rule = built && buildRRule(built)
    if (rule) return { rule, matched: m[0] }
  }
  return null
}
