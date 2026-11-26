import { describe, expect, it } from 'vitest'
import { REF_SUNDAY_ISO, REF_THURSDAY_ISO } from '../test/factories'
import {
  DEFAULT_CUSTOM_INTERVAL,
  EMPTY_RECURRENCE,
  WORKDAYS,
  followStart,
  isMonthday,
  isOrdinalPosition,
  isWeekdayCode,
  isWorkdaySet,
  monthlyDefaultsFor,
  normalizeInterval,
  orderWeekdays,
  weekdayCode,
  withFreq,
  withUnit,
  type RecurrenceValue,
  type WeekdayCode,
} from './model'
import { parseRRule } from './rrule-parse'

describe('monthlyDefaultsFor', () => {
  it('keeps the empty defaults without a start date', () => {
    expect(monthlyDefaultsFor(null)).toEqual({
      monthday: EMPTY_RECURRENCE.monthday,
      position: EMPTY_RECURRENCE.position,
      monthWeekday: EMPTY_RECURRENCE.monthWeekday,
    })
  })

  it.each([
    [REF_SUNDAY_ISO, { monthday: 25, position: 4, monthWeekday: 'SU' }],
    ['2026-06-01', { monthday: 1, position: 1, monthWeekday: 'MO' }],
    ['2026-07-31', { monthday: 31, position: 5, monthWeekday: 'FR' }],
  ])('matches the start date %s', (iso, defaults) => {
    expect(monthlyDefaultsFor(iso)).toEqual(defaults)
  })
})

describe('normalizeInterval', () => {
  it.each([
    [3, 3],
    [2.7, 2],
    [0, 1],
    [-4, 1],
    [Number.NaN, 1],
  ])('turns %d into %i', (input, interval) => {
    expect(normalizeInterval(input)).toBe(interval)
  })
})

describe('weekday sets', () => {
  it('orders codes Monday-first and drops duplicates', () => {
    expect(orderWeekdays(['SU', 'WE', 'MO', 'WE'])).toEqual(['MO', 'WE', 'SU'])
  })

  it('recognizes exactly the ordered Mon–Fri set', () => {
    expect(isWorkdaySet(['MO', 'TU', 'WE', 'TH', 'FR'])).toBe(true)
    expect(isWorkdaySet(['MO', 'TU', 'WE', 'TH'])).toBe(false)
    expect(isWorkdaySet(['MO', 'TU', 'WE', 'TH', 'SA'])).toBe(false)
  })

  it('names the weekday code of a local date', () => {
    expect(weekdayCode(new Date(2026, 9, 25))).toBe('SU')
    expect(weekdayCode(new Date(2026, 5, 1))).toBe('MO')
  })
})

describe('guards', () => {
  it('accepts only RRULE weekday codes', () => {
    expect(isWeekdayCode('MO')).toBe(true)
    expect(isWeekdayCode('mo')).toBe(false)
    expect(isWeekdayCode('1MO')).toBe(false)
  })

  it('accepts first..fifth and last as positions', () => {
    expect([1, 5, -1].every(isOrdinalPosition)).toBe(true)
    expect([0, 6, -2].some(isOrdinalPosition)).toBe(false)
  })

  it('accepts a day of the month or -1 for the last day', () => {
    expect([1, 31, -1].every(isMonthday)).toBe(true)
    expect([0, 32, -2].some(isMonthday)).toBe(false)
  })
})

describe('withFreq / withUnit', () => {
  const custom = { ...EMPTY_RECURRENCE, freq: 'custom' as const, unit: 'week' as const }

  it('defaults a custom interval to every other period', () => {
    expect(withFreq(EMPTY_RECURRENCE, 'custom', null).interval).toBe(DEFAULT_CUSTOM_INTERVAL)
  })

  it('seeds the monthly fields from the start date on switching to monthly', () => {
    const next = withFreq(custom, 'monthly', REF_SUNDAY_ISO)
    expect(next).toMatchObject({ freq: 'monthly', monthday: 25, position: 4, monthWeekday: 'SU' })
  })

  it('keeps the monthly fields when switching to another frequency', () => {
    const monthly = { ...EMPTY_RECURRENCE, freq: 'monthly' as const, monthday: 9 }
    expect(withFreq(monthly, 'weekly', REF_SUNDAY_ISO)).toMatchObject({
      freq: 'weekly',
      monthday: 9,
    })
  })

  it('seeds the monthly fields only when the custom unit enters months', () => {
    const months = withUnit(custom, 'month', REF_SUNDAY_ISO)
    expect(months).toMatchObject({ unit: 'month', monthday: 25 })
    expect(withUnit({ ...months, monthday: 3 }, 'month', REF_SUNDAY_ISO).monthday).toBe(3)
    expect(withUnit(custom, 'day', REF_SUNDAY_ISO)).toEqual({ ...custom, unit: 'day' })
  })
})

describe('followStart', () => {
  const monthly: RecurrenceValue = { ...EMPTY_RECURRENCE, freq: 'monthly', monthday: 15 }
  const nthWeekday: RecurrenceValue = {
    ...monthly,
    monthlyMode: 'weekday',
    position: 2,
    monthWeekday: 'TU',
  }

  it('moves a monthly day of the month to the new date', () => {
    expect(followStart(monthly, REF_SUNDAY_ISO)).toEqual({ ...monthly, monthday: 25 })
  })

  it('moves an Nth weekday to the new date, a fifth one included', () => {
    expect(followStart(nthWeekday, REF_SUNDAY_ISO)).toEqual({
      ...nthWeekday,
      position: 4,
      monthWeekday: 'SU',
    })
    expect(followStart(nthWeekday, '2026-07-31')).toMatchObject({ position: 5, monthWeekday: 'FR' })
  })

  it('follows a custom every-N-months rule too', () => {
    const months: RecurrenceValue = { ...monthly, freq: 'custom', unit: 'month', interval: 3 }
    expect(followStart(months, '2026-06-01')).toEqual({ ...months, monthday: 1 })
  })

  it.each<[string, Partial<RecurrenceValue>]>([
    ['the last day', { monthday: -1 }],
    ['the last weekday', { monthlyMode: 'weekday', position: -1, monthWeekday: 'FR' }],
    ['the first workday', { monthlyMode: 'weekday', position: 1, monthWeekday: 'WD' }],
    ['the last workday', { monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' }],
  ])('keeps %s', (_, fields) => {
    const value = { ...monthly, ...fields }
    expect(followStart(value, REF_SUNDAY_ISO)).toEqual(value)
  })

  it.each<[string, Partial<RecurrenceValue>]>([
    ['daily', { freq: 'daily' }],
    ['yearly', { freq: 'yearly' }],
    ['every N days', { freq: 'custom', unit: 'day' }],
  ])('leaves a %s rule alone', (_, fields) => {
    const value = { ...monthly, ...fields }
    expect(followStart(value, REF_SUNDAY_ISO)).toEqual(value)
  })

  it('never rewrites a rule the picker cannot model', () => {
    const unmodeled = parseRRule('FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3')
    expect(followStart(unmodeled, REF_SUNDAY_ISO)).toEqual(unmodeled)
  })

  it('rewrites nothing when the date is cleared', () => {
    expect(followStart(monthly, null)).toEqual(monthly)
    expect(followStart(nthWeekday, null)).toEqual(nthWeekday)
  })

  it('follows a day picked by hand that differed from the old date', () => {
    const picked = followStart({ ...monthly, monthday: 3 }, '2026-06-01')
    expect(followStart(picked, REF_SUNDAY_ISO).monthday).toBe(25)
  })
})

describe('followStart on weekdays', () => {
  const weekly = (weekdays: WeekdayCode[]): RecurrenceValue => ({
    ...EMPTY_RECURRENCE,
    freq: 'weekly',
    weekdays,
  })

  it('keeps an empty list, which already means the start weekday', () => {
    expect(followStart(weekly([]), REF_SUNDAY_ISO)).toEqual(weekly([]))
  })

  it('moves a single weekday to the new date', () => {
    expect(followStart(weekly(['MO']), REF_SUNDAY_ISO)).toEqual(weekly(['SU']))
  })

  it('keeps several weekdays when the new date is one of them', () => {
    expect(followStart(weekly(['MO', 'SU']), REF_SUNDAY_ISO)).toEqual(weekly(['MO', 'SU']))
  })

  it('adds the new date weekday to several weekdays, in week order', () => {
    expect(followStart(weekly(['SU', 'MO']), REF_THURSDAY_ISO)).toEqual(weekly(['MO', 'TH', 'SU']))
    expect(followStart(weekly(['TH', 'MO']), REF_SUNDAY_ISO)).toEqual(weekly(['MO', 'TH', 'SU']))
  })

  it('lets the workday set gain a Saturday', () => {
    expect(followStart(weekly([...WORKDAYS]), '2026-10-24')).toEqual(weekly([...WORKDAYS, 'SA']))
  })

  it('follows a custom every-N-weeks rule too', () => {
    const weeks: RecurrenceValue = { ...weekly(['WE']), freq: 'custom', unit: 'week' }
    expect(followStart(weeks, REF_SUNDAY_ISO)).toEqual({ ...weeks, weekdays: ['SU'] })
  })

  it('rewrites nothing when the date is cleared', () => {
    expect(followStart(weekly(['MO']), null)).toEqual(weekly(['MO']))
  })
})

describe('followStart and the end date', () => {
  const ending: RecurrenceValue = { ...EMPTY_RECURRENCE, freq: 'daily', until: '2026-11-20' }

  it('drops an end date that lies before the new date', () => {
    expect(followStart(ending, '2026-11-21')).toEqual({ ...ending, until: null })
  })

  it('keeps an end date on or after the new date', () => {
    expect(followStart(ending, '2026-11-20')).toEqual(ending)
    expect(followStart(ending, '2026-11-02')).toEqual(ending)
  })

  it('brings the end date back when a later follow from the same base moves the date back', () => {
    const base: RecurrenceValue = { ...ending, freq: 'weekly', weekdays: ['MO'] }
    expect(followStart(base, '2026-11-24').until).toBeNull()
    expect(followStart(base, '2026-11-17')).toEqual({ ...base, weekdays: ['TU'] })
  })

  it('leaves the end date of a rule without a repeat alone', () => {
    const none: RecurrenceValue = { ...ending, freq: 'none' }
    expect(followStart(none, '2026-11-21')).toEqual(none)
  })
})
