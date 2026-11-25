import { describe, expect, it } from 'vitest'
import { REF_THURSDAY_ISO, RRULE, WORKDAY_LIST } from '../test/factories'
import { parseRecurrencePhrase } from './phrase-parse'

describe('parseRecurrencePhrase', () => {
  it.each([
    ['the 15th of every month', 'FREQ=MONTHLY;BYMONTHDAY=15'],
    ['monthly on the 15th', 'FREQ=MONTHLY;BYMONTHDAY=15'],
    ['the first day of every month', 'FREQ=MONTHLY;BYMONTHDAY=1'],
    ['the last day of every month', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
    ['every month on the last day', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
    ['the first Monday of every month', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
    ['the second Tuesday of each month', 'FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2'],
    ['the last Friday of every month', 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1'],
    ['the fifth Wednesday of every month', 'FREQ=MONTHLY;BYDAY=WE;BYSETPOS=5'],
    ['every month on the first monday', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
    ['the first workday of every month', RRULE.firstWorkday],
    ['the last work day of each month', RRULE.lastWorkday],
    ['the last business day of the month', RRULE.lastWorkday],
    ['every month on the last workday', RRULE.lastWorkday],
  ])('reads the monthly phrase "%s"', (text, rule) => {
    expect(parseRecurrencePhrase(text)?.rule).toBe(rule)
  })

  it.each([
    ['first day of every week', 'FREQ=WEEKLY;BYDAY=MO'],
    ['last day of every week', 'FREQ=WEEKLY;BYDAY=SU'],
    ['every monday', 'FREQ=WEEKLY;BYDAY=MO'],
    ['every weekday', RRULE.workdays],
    ['every workday', RRULE.workdays],
    ['every business day', RRULE.workdays],
    ['daily', RRULE.daily],
    ['every week', RRULE.weekly],
  ])('reads the weekly or simple phrase "%s"', (text, rule) => {
    expect(parseRecurrencePhrase(text)?.rule).toBe(rule)
  })

  it.each(['every year', 'yearly', 'annually'])('reads "%s" as yearly', (text) => {
    expect(parseRecurrencePhrase(text)?.rule).toBe(RRULE.yearly)
  })

  it('strips only the yearly phrase from the title', () => {
    expect(parseRecurrencePhrase('renew insurance every year')?.matched).toBe('every year')
  })

  it('returns the matched substring so the caller can strip it', () => {
    const m = parseRecurrencePhrase('team sync the first Monday of every month')
    expect(m?.matched).toBe('the first Monday of every month')
  })

  it.each([
    ['every other tuesday', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'],
    ['every 3 days', 'FREQ=DAILY;INTERVAL=3'],
    ['every other day', 'FREQ=DAILY;INTERVAL=2'],
    ['every 1 day', RRULE.daily],
    ['every 2 weeks on mon and wed', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'],
    ['every other week', 'FREQ=WEEKLY;INTERVAL=2'],
    ['every week on fri, mon and wed', 'FREQ=WEEKLY;BYDAY=MO,WE,FR'],
    ['every mon & thursdays', 'FREQ=WEEKLY;BYDAY=MO,TH'],
    ['the 31st every month', 'FREQ=MONTHLY;BYMONTHDAY=31'],
    ['every 2 months on the 15th', 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15'],
    ['every 3 months on the last day', 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1'],
    ['every 2 months on the first monday', 'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;BYSETPOS=1'],
    [
      'the last workday of every other month',
      `FREQ=MONTHLY;INTERVAL=2;BYDAY=${WORKDAY_LIST};BYSETPOS=-1`,
    ],
    ['the 15th of every 4 months', 'FREQ=MONTHLY;INTERVAL=4;BYMONTHDAY=15'],
  ])('reads the interval phrase "%s"', (text, rule) => {
    expect(parseRecurrencePhrase(text)?.rule).toBe(rule)
  })

  it('anchors a bare monthly phrase to the start day', () => {
    expect(parseRecurrencePhrase('every other month', REF_THURSDAY_ISO)?.rule).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=25',
    )
    expect(parseRecurrencePhrase('monthly', REF_THURSDAY_ISO)?.rule).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=25',
    )
  })

  it('strips the whole interval phrase', () => {
    expect(parseRecurrencePhrase('review every 2 weeks on mon and wed')?.matched).toBe(
      'every 2 weeks on mon and wed',
    )
    expect(parseRecurrencePhrase('pay on the 31st every month')?.matched).toBe(
      'the 31st every month',
    )
  })

  it.each(['buy bread', 'call mum tomorrow', '3 days of rest', '2 weeks notice', 'every 0 days'])(
    'is null for "%s", which has no recurrence phrase',
    (text) => {
      expect(parseRecurrencePhrase(text)).toBeNull()
    },
  )

  it('does not read a bare count before "every month" as a day of the month', () => {
    expect(parseRecurrencePhrase('buy 2 every month')?.matched).toBe('every month')
  })
})
