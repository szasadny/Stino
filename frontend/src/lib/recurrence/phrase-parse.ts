import {
  EMPTY_RECURRENCE,
  WORKDAY_CODE,
  WORKDAYS,
  isMonthday,
  monthlyDefaultsFor,
  type CustomUnit,
  type OrdinalPosition,
  type RecurrenceFreq,
  type RecurrenceValue,
  type WeekdayCode,
} from './model'
import { ORDINAL_WORDS, PHRASE_RULES, WEEKDAY_WORDS, type PhraseKind } from './phrase-grammar'
import { buildRRule } from './rrule-build'

type Groups = Partial<Record<string, string>>

const UNIT_FREQ: Record<CustomUnit, RecurrenceFreq> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
}

// `matched` is the substring to strip from the title; `start` anchors a bare "every month".
export function parseRecurrencePhrase(
  text: string,
  start: string | null = null,
): { rule: string; matched: string } | null {
  for (const { re, kind } of PHRASE_RULES) {
    const m = re.exec(text)
    if (!m) continue
    const value = phraseValue(kind, m.groups ?? {}, start)
    const rule = value && buildRRule(value)
    if (rule) return { rule, matched: m[0] }
  }
  return null
}

function phraseValue(kind: PhraseKind, g: Groups, start: string | null): RecurrenceValue | null {
  switch (kind) {
    case 'monthlyWeekday':
      return monthlyWeekday(g.ordinal, g.weekday, g.count)
    case 'monthlyWorkday':
      return repeatEvery('month', g.count, {
        monthlyMode: 'weekday',
        position: edgePosition(g.edge),
        monthWeekday: WORKDAY_CODE,
      })
    case 'monthlyEdgeDay':
      return monthlyMonthday(edgePosition(g.edge), g.count)
    case 'monthlyDay':
      return monthlyMonthday(Number(g.day ?? g.suffixedDay), g.count)
    case 'weekEdgeDay':
      return {
        ...EMPTY_RECURRENCE,
        freq: 'weekly',
        weekdays: [edgePosition(g.edge) === -1 ? 'SU' : 'MO'],
      }
    case 'workweek':
      return { ...EMPTY_RECURRENCE, freq: 'weekly', weekdays: [...WORKDAYS] }
    case 'weekly':
      return repeatWeekly(g.count, g.list)
    case 'daily':
      return repeatEvery('day', g.count, {})
    case 'yearly':
      return { ...EMPTY_RECURRENCE, freq: 'yearly' }
    case 'monthly':
      return monthlyMonthday(monthlyDefaultsFor(start).monthday, g.count)
  }
}

// "other" ⇒ 2; null when not a positive count.
function intervalOf(count: string | undefined): number | null {
  if (!count) return 1
  const n = count.toLowerCase() === 'other' ? 2 : Number(count)
  return n >= 1 ? n : null
}

// Interval 1 is the plain frequency; a larger one is the picker's Custom every-N-units.
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

function repeatWeekly(count: string | undefined, list: string | undefined): RecurrenceValue | null {
  const weekdays: WeekdayCode[] = []
  for (const word of list?.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (word === 'and') continue
    const code = WEEKDAY_WORDS[word] ?? WEEKDAY_WORDS[word.replace(/s$/, '')]
    if (!code) return null
    weekdays.push(code)
  }
  return repeatEvery('week', count, { weekdays })
}

function edgePosition(edge: string | undefined): OrdinalPosition {
  return edge?.toLowerCase() === 'last' ? -1 : 1
}

function monthlyWeekday(
  ordinal: string | undefined,
  weekday: string | undefined,
  count: string | undefined,
): RecurrenceValue | null {
  const position = ORDINAL_WORDS[ordinal?.toLowerCase() ?? '']
  const code = WEEKDAY_WORDS[weekday?.toLowerCase() ?? '']
  if (position === undefined || !code) return null
  return repeatEvery('month', count, { monthlyMode: 'weekday', position, monthWeekday: code })
}

function monthlyMonthday(day: number, count: string | undefined): RecurrenceValue | null {
  if (!isMonthday(day)) return null
  return repeatEvery('month', count, { monthlyMode: 'monthday', monthday: day })
}
