import type { OrdinalPosition, WeekdayCode } from './model'

export type PhraseKind =
  | 'monthlyWeekday'
  | 'monthlyWorkday'
  | 'monthlyEdgeDay'
  | 'monthlyDay'
  | 'weekEdgeDay'
  | 'workweek'
  | 'weekly'
  | 'daily'
  | 'yearly'
  | 'monthly'

export const ORDINAL_WORDS: Record<string, OrdinalPosition> = {
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

// Longer names first so the alternation prefers "monday" over "mon".
export const WEEKDAY_WORDS: Record<string, WeekdayCode> = {
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

const ORDINAL_ALT = Object.keys(ORDINAL_WORDS).join('|')
const WEEKDAY_ALT = Object.keys(WEEKDAY_WORDS).join('|')
const ORDINAL = `(?<ordinal>${ORDINAL_ALT})`
const WEEKDAY = `(?<weekday>${WEEKDAY_ALT})`
const EDGE = '(?<edge>first|last)'
const COUNT = '(?<count>\\d+|other)'
const ORDINAL_SUFFIX = '(?:st|nd|rd|th)'
const WEEKDAY_LIST = `(?<list>(?:${WEEKDAY_ALT})s?(?:(?:\\s*,\\s*(?:and\\s+)?|\\s*&\\s*|\\s+and\\s+)(?:${WEEKDAY_ALT})s?)*)`
const WORKDAY_WORD = '(?:work(?:ing)?\\s?day|business\\s+day)'
const EVERY_DAY = `(?:every\\s+(?:${COUNT}\\s+days?|day)|daily)`
const EVERY_WEEK = `(?:every\\s+(?:${COUNT}\\s+weeks?|week)|weekly)`
const EVERY_MONTH = `(?:every\\s+(?:${COUNT}\\s+months?|month)|monthly)`
const OF_EVERY_MONTH = `(?:of\\s+(?:each|the)\\s+month|(?:of\\s+)?${EVERY_MONTH})`

const rule = (pattern: string, kind: PhraseKind) => ({ re: new RegExp(pattern, 'i'), kind })

// Most specific first; the first matching pattern wins.
export const PHRASE_RULES: readonly { re: RegExp; kind: PhraseKind }[] = [
  rule(`\\b(?:the\\s+)?${ORDINAL}\\s+${WEEKDAY}\\s+${OF_EVERY_MONTH}\\b`, 'monthlyWeekday'),
  rule(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+${ORDINAL}\\s+${WEEKDAY}\\b`, 'monthlyWeekday'),
  rule(`\\b(?:the\\s+)?${EDGE}\\s+${WORKDAY_WORD}\\s+${OF_EVERY_MONTH}\\b`, 'monthlyWorkday'),
  rule(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+${EDGE}\\s+${WORKDAY_WORD}\\b`, 'monthlyWorkday'),
  rule(`\\b(?:the\\s+)?${EDGE}\\s+day\\s+${OF_EVERY_MONTH}\\b`, 'monthlyEdgeDay'),
  rule(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+${EDGE}\\s+day\\b`, 'monthlyEdgeDay'),
  // A bare number needs "the" or a suffix, so "buy 2 every month" isn't read as a date.
  rule(
    `\\b(?:the\\s+(?<day>\\d{1,2})${ORDINAL_SUFFIX}?|(?<suffixedDay>\\d{1,2})${ORDINAL_SUFFIX})\\s+${OF_EVERY_MONTH}\\b`,
    'monthlyDay',
  ),
  rule(`\\b${EVERY_MONTH}\\s+on\\s+the\\s+(?<day>\\d{1,2})${ORDINAL_SUFFIX}?\\b`, 'monthlyDay'),
  rule(`\\b(?:the\\s+)?${EDGE}\\s+day\\s+of\\s+(?:every|each|the)\\s+week\\b`, 'weekEdgeDay'),
  rule(`\\bevery\\s+(?:week\\s?day|${WORKDAY_WORD})\\b`, 'workweek'),
  rule(`\\bevery\\s+(?:${COUNT}\\s+)?${WEEKDAY_LIST}\\b`, 'weekly'),
  rule(`\\b${EVERY_DAY}\\b`, 'daily'),
  rule('\\b(?:every\\s+year|yearly|annually)\\b', 'yearly'),
  rule(`\\b${EVERY_WEEK}\\b(?:\\s+on\\s+${WEEKDAY_LIST}\\b)?`, 'weekly'),
  rule(`\\b${EVERY_MONTH}\\b`, 'monthly'),
]
