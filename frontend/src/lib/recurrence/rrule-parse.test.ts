import { describe, expect, it } from 'vitest'
import { RRULE, WORKDAY_LIST } from '../test/factories'
import { EMPTY_RECURRENCE } from './model'
import { buildRRule } from './rrule-build'
import { isUnmodeledRule, parseRRule, seriesUntil } from './rrule-parse'

describe('parseRRule', () => {
  it('treats null/unmodeled rules as "none"', () => {
    expect(parseRRule(null).freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY').freq).toBe('none')
  })

  it('keeps a COUNT-limited rule unmodeled so a re-save cannot drop its end', () => {
    expect(parseRRule('FREQ=DAILY;COUNT=5').freq).toBe('none')
    expect(isUnmodeledRule('FREQ=WEEKLY;BYDAY=MO;COUNT=3')).toBe(true)
  })

  it('parses the modeled shapes back into the picker form', () => {
    expect(parseRRule(RRULE.daily).freq).toBe('daily')
    expect(parseRRule('FREQ=DAILY;INTERVAL=3')).toMatchObject({
      freq: 'custom',
      unit: 'day',
      interval: 3,
    })
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE')).toMatchObject({
      freq: 'weekly',
      weekdays: ['MO', 'WE'],
    })
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toMatchObject({
      freq: 'custom',
      unit: 'week',
      interval: 2,
      weekdays: ['TU'],
    })
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO,WE;UNTIL=20261231')).toMatchObject({
      freq: 'custom',
      unit: 'week',
      interval: 2,
      weekdays: ['MO', 'WE'],
      until: '2026-12-31',
    })
  })

  it('parses a plain yearly rule, and leaves shaped yearly rules as "none"', () => {
    expect(parseRRule(RRULE.yearly).freq).toBe('yearly')
    expect(parseRRule('FREQ=YEARLY;INTERVAL=1').freq).toBe('yearly')
    expect(parseRRule('FREQ=YEARLY;INTERVAL=2').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=24').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYDAY=MO;BYSETPOS=1').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYWEEKNO=20').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYYEARDAY=100').freq).toBe('none')
  })

  it('parses monthly shapes, and leaves unmodeled monthly as "none"', () => {
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'monthday',
      monthday: 15,
    })
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'monthday',
      monthday: -1,
    })
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: 1,
      monthWeekday: 'MO',
    })
    expect(parseRRule('FREQ=MONTHLY;BYDAY=-1FR')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: -1,
      monthWeekday: 'FR',
    })
    expect(parseRRule(RRULE.firstWorkday)).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: 1,
      monthWeekday: 'WD',
    })
    expect(parseRRule(RRULE.lastWorkday)).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: -1,
      monthWeekday: 'WD',
    })
    expect(parseRRule('FREQ=MONTHLY;BYDAY=FR,MO,WE,TU,TH;BYSETPOS=-1')).toMatchObject({
      monthWeekday: 'WD',
      position: -1,
    })
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=1,15').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1,15').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;BYDAY=SA,SU;BYSETPOS=-1').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=FR;BYMONTHDAY=13').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=13;BYSETPOS=1').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;BYMONTH=6;BYMONTHDAY=24').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;BYMONTH=6;BYDAY=MO;BYSETPOS=1').freq).toBe('none')
  })

  it('parses interval-monthly shapes as custom every-N-months', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 2,
      monthlyMode: 'monthday',
      monthday: 15,
    })
    expect(parseRRule(`FREQ=MONTHLY;INTERVAL=3;BYDAY=${WORKDAY_LIST};BYSETPOS=-1`)).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 3,
      monthlyMode: 'weekday',
      position: -1,
      monthWeekday: 'WD',
    })
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 2,
      monthlyMode: 'weekday',
      position: 2,
      monthWeekday: 'TU',
    })
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1;UNTIL=20271231')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 6,
      monthday: -1,
      until: '2027-12-31',
    })
  })

  it('keeps INTERVAL=1 monthly rules in the Monthly mode', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')).toMatchObject({
      freq: 'monthly',
      monthday: 15,
    })
    const rule = buildRRule({
      ...EMPTY_RECURRENCE,
      freq: 'custom',
      unit: 'month',
      interval: 1,
      monthlyMode: 'monthday',
      monthday: 15,
    })
    expect(rule).toBe('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')
    expect(parseRRule(rule).freq).toBe('monthly')
  })

  it('carries an UNTIL end date onto a modeled rule, accepting both date and date-time forms', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20260630')).toMatchObject({
      freq: 'daily',
      until: '2026-06-30',
    })
    expect(
      parseRRule('FREQ=WEEKLY;WKST=MO;UNTIL=20260520T000000Z;INTERVAL=1;BYDAY=WE'),
    ).toMatchObject({ freq: 'weekly', weekdays: ['WE'], until: '2026-05-20' })
    expect(parseRRule(RRULE.daily).until).toBeNull()
  })

  it.each([
    RRULE.daily,
    RRULE.weekly,
    'FREQ=WEEKLY;BYDAY=MO,WE',
    'FREQ=DAILY;INTERVAL=3',
    'FREQ=WEEKLY;INTERVAL=2',
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
    `FREQ=WEEKLY;INTERVAL=3;BYDAY=${WORKDAY_LIST}`,
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;UNTIL=20261231',
    'FREQ=WEEKLY;BYDAY=MO',
    'FREQ=WEEKLY;BYDAY=SU',
    'FREQ=MONTHLY;BYMONTHDAY=15',
    'FREQ=MONTHLY;BYMONTHDAY=-1',
    'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
    'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
    'FREQ=MONTHLY;BYDAY=WE;BYSETPOS=5',
    RRULE.firstWorkday,
    RRULE.lastWorkday,
    RRULE.yearly,
    'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15',
    'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1',
    'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;BYSETPOS=1',
    'FREQ=MONTHLY;INTERVAL=4;BYDAY=FR;BYSETPOS=-1',
    'FREQ=MONTHLY;INTERVAL=2;BYDAY=WE;BYSETPOS=5',
    `FREQ=MONTHLY;INTERVAL=3;BYDAY=${WORKDAY_LIST};BYSETPOS=1`,
    `FREQ=MONTHLY;INTERVAL=3;BYDAY=${WORKDAY_LIST};BYSETPOS=-1`,
    'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20271231',
  ])('round-trips %s through build → parse → build', (rule) => {
    expect(buildRRule(parseRRule(rule))).toBe(rule)
  })
})

describe('isUnmodeledRule', () => {
  it.each([
    'FREQ=WEEKLY;BYMONTH=6;BYDAY=MO',
    'FREQ=WEEKLY;INTERVAL=2;BYMONTHDAY=1',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=WEEKLY;BYDAY=MO,XX',
    'FREQ=DAILY;BYDAY=MO,WE',
    'FREQ=DAILY;INTERVAL=2;BYMONTH=6',
  ])('keeps %s read-only so a picker edit cannot drop its parts', (rule) => {
    expect(isUnmodeledRule(rule)).toBe(true)
  })

  it('is false for a rule the picker models, and for no rule', () => {
    expect(isUnmodeledRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe(false)
    expect(isUnmodeledRule(null)).toBe(false)
  })
})

describe('seriesUntil', () => {
  it('reads the end date of any rule, modeled or not', () => {
    expect(seriesUntil('FREQ=DAILY;UNTIL=20260624')).toBe('2026-06-24')
    expect(seriesUntil('FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=24;until=20261231')).toBe('2026-12-31')
  })

  it('keeps the date part of a date-time UNTIL', () => {
    expect(seriesUntil('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260624T000000Z')).toBe('2026-06-24')
  })

  it('is null without an UNTIL or with a malformed one', () => {
    expect(seriesUntil(RRULE.daily)).toBeNull()
    expect(seriesUntil('FREQ=DAILY;COUNT=5')).toBeNull()
    expect(seriesUntil('FREQ=DAILY;UNTIL=soon')).toBeNull()
    expect(seriesUntil('FREQ=DAILY;UNTIL=')).toBeNull()
  })
})
