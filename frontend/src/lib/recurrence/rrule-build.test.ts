import { describe, expect, it } from 'vitest'
import { RRULE, WORKDAY_LIST } from '../test/factories'
import { EMPTY_RECURRENCE, type RecurrenceValue } from './model'
import { buildRRule } from './rrule-build'

const value = (partial: Partial<RecurrenceValue>): RecurrenceValue => ({
  ...EMPTY_RECURRENCE,
  ...partial,
})

describe('buildRRule', () => {
  it('returns null when the task does not repeat', () => {
    expect(buildRRule(value({ freq: 'none' }))).toBeNull()
  })

  it('builds daily, weekly and yearly rules', () => {
    expect(buildRRule(value({ freq: 'daily' }))).toBe(RRULE.daily)
    expect(buildRRule(value({ freq: 'weekly' }))).toBe(RRULE.weekly)
    expect(buildRRule(value({ freq: 'yearly' }))).toBe(RRULE.yearly)
  })

  it('orders weekly BYDAY Monday-first regardless of input order', () => {
    expect(buildRRule(value({ freq: 'weekly', weekdays: ['WE', 'MO'] }))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE',
    )
  })

  it('maps custom intervals to DAILY/WEEKLY with INTERVAL', () => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval: 3 }))).toBe(
      'FREQ=DAILY;INTERVAL=3',
    )
    expect(buildRRule(value({ freq: 'custom', unit: 'week', interval: 2 }))).toBe(
      'FREQ=WEEKLY;INTERVAL=2',
    )
  })

  it('keeps custom every-N-weeks weekdays as a Monday-first, deduped BYDAY', () => {
    const weeks = (partial: Partial<RecurrenceValue>) =>
      buildRRule(value({ freq: 'custom', unit: 'week', interval: 2, ...partial }))
    expect(weeks({ weekdays: ['MO', 'WE'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    expect(weeks({ weekdays: ['WE', 'MO', 'WE'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    expect(weeks({ weekdays: [] })).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(weeks({ weekdays: ['MO', 'WE'], until: '2026-12-31' })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231',
    )
  })

  it('never emits BYDAY for custom days or months, whatever weekdays linger', () => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval: 3, weekdays: ['MO'] }))).toBe(
      'FREQ=DAILY;INTERVAL=3',
    )
    expect(
      buildRRule(
        value({ freq: 'custom', unit: 'month', interval: 2, monthday: 15, weekdays: ['MO'] }),
      ),
    ).toBe('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15')
  })

  it('builds custom every-N-months rules over every monthly shape', () => {
    const months = (partial: Partial<RecurrenceValue>) =>
      buildRRule(value({ freq: 'custom', unit: 'month', ...partial }))
    expect(months({ interval: 2, monthlyMode: 'monthday', monthday: 15 })).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15',
    )
    expect(months({ interval: 6, monthlyMode: 'monthday', monthday: -1 })).toBe(
      'FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1',
    )
    expect(months({ interval: 2, monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' })).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;BYSETPOS=1',
    )
    expect(months({ interval: 3, monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' })).toBe(
      `FREQ=MONTHLY;INTERVAL=3;BYDAY=${WORKDAY_LIST};BYSETPOS=-1`,
    )
    expect(
      months({ interval: 4, monthlyMode: 'monthday', monthday: 31, until: '2027-06-30' }),
    ).toBe('FREQ=MONTHLY;INTERVAL=4;BYMONTHDAY=31;UNTIL=20270630')
  })

  it.each([
    [2.7, 'FREQ=DAILY;INTERVAL=2'],
    [0, 'FREQ=DAILY;INTERVAL=1'],
    [-3, 'FREQ=DAILY;INTERVAL=1'],
  ])('floors a custom interval of %d to a whole number of at least 1', (interval, rule) => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval }))).toBe(rule)
  })

  it('builds monthly rules by date-of-month (incl. last day)', () => {
    expect(buildRRule(value({ freq: 'monthly', monthlyMode: 'monthday', monthday: 15 }))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=15',
    )
    expect(buildRRule(value({ freq: 'monthly', monthlyMode: 'monthday', monthday: -1 }))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=-1',
    )
  })

  it('appends an UNTIL end date as the bare-date form, on any repeating rule', () => {
    expect(buildRRule(value({ freq: 'daily', until: '2026-06-30' }))).toBe(
      'FREQ=DAILY;UNTIL=20260630',
    )
    expect(buildRRule(value({ freq: 'weekly', weekdays: ['MO'], until: '2026-12-31' }))).toBe(
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231',
    )
    expect(buildRRule(value({ freq: 'daily', until: null }))).toBe(RRULE.daily)
    expect(buildRRule(value({ freq: 'none', until: '2026-06-30' }))).toBeNull()
  })

  it('builds monthly rules by ordinal weekday (incl. fifth and last)', () => {
    const monthly = (position: RecurrenceValue['position'], monthWeekday: 'MO' | 'FR') =>
      buildRRule(value({ freq: 'monthly', monthlyMode: 'weekday', position, monthWeekday }))
    expect(monthly(1, 'MO')).toBe('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1')
    expect(monthly(-1, 'FR')).toBe('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1')
    expect(monthly(5, 'MO')).toBe('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5')
  })

  it('builds monthly rules by first/last workday (the Mon–Fri set)', () => {
    const workday = (position: RecurrenceValue['position']) =>
      buildRRule(value({ freq: 'monthly', monthlyMode: 'weekday', position, monthWeekday: 'WD' }))
    expect(workday(1)).toBe(RRULE.firstWorkday)
    expect(workday(-1)).toBe(RRULE.lastWorkday)
  })
})
