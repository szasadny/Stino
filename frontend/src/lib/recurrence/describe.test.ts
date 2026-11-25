import { describe, expect, it } from 'vitest'
import { RRULE } from '../test/factories'
import { monthlySkipNote, summarize, summarizeRule } from './describe'
import { EMPTY_MONTHLY, EMPTY_RECURRENCE, WORKDAYS, type RecurrenceValue } from './model'
import { buildRRule } from './rrule-build'

const value = (partial: Partial<RecurrenceValue>): RecurrenceValue => ({
  ...EMPTY_RECURRENCE,
  ...partial,
})

describe('summarize', () => {
  it('describes each shape in plain words', () => {
    expect(summarize(value({ freq: 'none' }))).toBe('Does not repeat')
    expect(summarize(value({ freq: 'daily' }))).toBe('Every day')
    expect(summarize(value({ freq: 'weekly', weekdays: ['WE', 'MO'] }))).toBe('Weekly on Mon, Wed')
    expect(summarize(value({ freq: 'weekly' }))).toBe('Every week')
    expect(summarize(value({ freq: 'weekly', weekdays: ['FR', 'MO', 'TU', 'TH', 'WE'] }))).toBe(
      'Every weekday',
    )
    expect(summarize(value({ freq: 'yearly' }))).toBe('Every year')
    expect(summarize(value({ freq: 'custom', unit: 'day', interval: 1 }))).toBe('Every day')
    expect(summarize(value({ freq: 'custom', unit: 'week', interval: 2 }))).toBe('Every 2 weeks')
    expect(
      summarize(value({ freq: 'custom', unit: 'week', interval: 2, weekdays: ['WE', 'MO'] })),
    ).toBe('Every 2 weeks on Mon, Wed')
    expect(
      summarize(value({ freq: 'custom', unit: 'week', interval: 3, weekdays: [...WORKDAYS] })),
    ).toBe('Every 3 weeks on weekdays')
  })

  it('describes monthly shapes', () => {
    const monthly = (partial: Partial<RecurrenceValue>) =>
      summarize(value({ freq: 'monthly', ...partial }))
    expect(monthly({ monthlyMode: 'monthday', monthday: 15 })).toBe('Monthly on day 15')
    expect(monthly({ monthlyMode: 'monthday', monthday: -1 })).toBe('Monthly on the last day')
    expect(monthly({ monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' })).toBe(
      'Monthly on the first Mon',
    )
    expect(monthly({ monthlyMode: 'weekday', position: -1, monthWeekday: 'FR' })).toBe(
      'Monthly on the last Fri',
    )
    expect(monthly({ monthlyMode: 'weekday', position: 1, monthWeekday: 'WD' })).toBe(
      'Monthly on the first workday',
    )
    expect(monthly({ monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' })).toBe(
      'Monthly on the last workday',
    )
  })

  it('describes custom every-N-months in the monthly wording', () => {
    const months = (partial: Partial<RecurrenceValue>) =>
      summarize(value({ freq: 'custom', unit: 'month', ...partial }))
    expect(months({ interval: 2, monthlyMode: 'monthday', monthday: 15 })).toBe(
      'Every 2 months on day 15',
    )
    expect(months({ interval: 6, monthlyMode: 'monthday', monthday: -1 })).toBe(
      'Every 6 months on the last day',
    )
    expect(months({ interval: 3, monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' })).toBe(
      'Every 3 months on the last workday',
    )
    expect(months({ interval: 2, monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' })).toBe(
      'Every 2 months on the first Mon',
    )
    expect(months({ interval: 1, monthlyMode: 'monthday', monthday: 15 })).toBe(
      'Every month on day 15',
    )
  })

  it('appends the end date when a rule has an UNTIL', () => {
    expect(summarize(value({ freq: 'daily', until: '2026-06-30' }))).toBe(
      'Every day until Tue 30 June',
    )
  })

  it.each([
    [2.7, 'Every 2 days'],
    [0, 'Every day'],
  ])('describes the interval %d the way buildRRule writes it', (interval, text) => {
    const custom = value({ freq: 'custom', unit: 'day', interval })
    expect(summarize(custom)).toBe(text)
    expect(summarizeRule(buildRRule(custom))).toBe(text)
  })
})

describe('summarizeRule', () => {
  it('summarizes straight from a stored rule', () => {
    expect(summarizeRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Weekly on Mon, Wed')
  })

  it('carries the UNTIL end date of a stored rule', () => {
    expect(summarizeRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231')).toBe(
      'Every 2 weeks on Mon, Wed until Thu 31 December',
    )
    expect(summarizeRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15;UNTIL=20261231')).toBe(
      'Every 2 months on day 15 until Thu 31 December',
    )
    expect(summarizeRule('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231')).toBe(
      'Weekly on Mon until Thu 31 December',
    )
  })

  it.each([
    ['FREQ=MONTHLY;BYMONTHDAY=1,15', 'Custom repeat'],
    ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'Custom repeat'],
    ['garbage', 'Custom repeat'],
    ['FREQ=DAILY;COUNT=5', 'Custom repeat'],
    ['FREQ=DAILY;BYDAY=MO,WE', 'Custom repeat'],
    [null, 'Does not repeat'],
  ])('labels %j as "%s"', (rule, text) => {
    expect(summarizeRule(rule)).toBe(text)
  })

  it('reads the workday shapes in words', () => {
    expect(summarizeRule(RRULE.workdays)).toBe('Every weekday')
    expect(summarizeRule(RRULE.lastWorkday)).toBe('Monthly on the last workday')
  })
})

describe('monthlySkipNote', () => {
  it.each([
    [{ monthday: 28 }, null],
    [{ monthday: -1 }, null],
    [{ monthday: 29 }, 'Months without this day are skipped.'],
    [{ monthday: 31 }, 'Months without this day are skipped.'],
  ] as const)('warns about short months for the date %o', (fields, note) => {
    expect(monthlySkipNote({ ...EMPTY_MONTHLY, monthlyMode: 'monthday', ...fields })).toBe(note)
  })

  it.each([
    [{ position: 4, monthWeekday: 'MO' }, null],
    [{ position: -1, monthWeekday: 'FR' }, null],
    [{ position: 5, monthWeekday: 'WD' }, null],
    [{ position: 5, monthWeekday: 'MO' }, 'Months without a fifth one are skipped.'],
  ] as const)('warns about a missing fifth weekday for %o', (fields, note) => {
    expect(monthlySkipNote({ ...EMPTY_MONTHLY, monthlyMode: 'weekday', ...fields })).toBe(note)
  })
})
