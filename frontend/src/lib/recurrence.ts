// The one place that maps the small set of UI recurrence options to/from an
// RFC-5545 RRULE string. The backend is the source of truth for *validating* and
// *expanding* a rule (via the `rrule` crate); this presentation helper only
// builds the rule the picker emits and parses one back so an existing task's
// rule can populate the picker. Keep the option⇄RRULE mapping here, not inlined
// in components.

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'custom'
export type CustomUnit = 'day' | 'week'

/** The picker's structured form. `none` ⇒ the task does not repeat. */
export interface RecurrenceValue {
  freq: RecurrenceFreq
  interval: number // custom: every N units (≥ 1)
  unit: CustomUnit // custom: days or weeks
  weekdays: string[] // weekly: RRULE day codes, e.g. ['MO','WE']; empty ⇒ the start weekday
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

const WEEKDAY_ORDER = WEEKDAY_OPTIONS.map((d) => d.code)

export const EMPTY_RECURRENCE: RecurrenceValue = {
  freq: 'none',
  interval: 2,
  unit: 'week',
  weekdays: [],
}

function isWeekdayCode(code: string): boolean {
  return WEEKDAY_ORDER.includes(code)
}

/** Sort weekday codes into canonical Monday-first order for stable output. */
function orderWeekdays(codes: string[]): string[] {
  return [...new Set(codes)].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
}

/** Build the RRULE string for a structured value, or null when it doesn't repeat. */
export function buildRRule(value: RecurrenceValue): string | null {
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
    case 'custom': {
      const freq = value.unit === 'week' ? 'WEEKLY' : 'DAILY'
      const interval = Math.max(1, Math.floor(value.interval) || 1)
      return `FREQ=${freq};INTERVAL=${interval}`
    }
  }
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
 * Parse an RRULE back into the picker's structured form (best effort). A rule we
 * don't model (e.g. an imported monthly rule) maps to `none`; callers should
 * keep the original string and treat it as read-only rather than overwrite it —
 * see [[RecurrencePicker]].
 */
export function parseRRule(rule: string | null): RecurrenceValue {
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
  return { ...EMPTY_RECURRENCE }
}

function codeLabel(code: string): string {
  return WEEKDAY_OPTIONS.find((d) => d.code === code)?.label ?? code
}

/** A short human summary of a structured value, e.g. "Weekly on Mon, Wed". */
export function summarize(value: RecurrenceValue): string {
  switch (value.freq) {
    case 'none':
      return 'Does not repeat'
    case 'daily':
      return 'Every day'
    case 'weekly':
      return value.weekdays.length
        ? `Weekly on ${orderWeekdays(value.weekdays).map(codeLabel).join(', ')}`
        : 'Every week'
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
