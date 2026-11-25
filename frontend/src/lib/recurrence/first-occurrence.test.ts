import { describe, expect, it } from 'vitest'
import { REF_SUNDAY_ISO as SUNDAY, RRULE } from '../test/factories'
import { firstOccurrenceOnOrAfter } from './first-occurrence'

describe('firstOccurrenceOnOrAfter', () => {
  it.each([RRULE.daily, RRULE.weekly, RRULE.yearly, 'FREQ=MONTHLY;BYMONTHDAY=25'])(
    'keeps a start that %s already generates',
    (rule) => {
      expect(firstOccurrenceOnOrAfter(rule, SUNDAY)).toBe(SUNDAY)
    },
  )

  it('moves to the next chosen weekday', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=WEEKLY;BYDAY=MO', SUNDAY)).toBe('2026-10-26')
    expect(firstOccurrenceOnOrAfter(RRULE.workdays, SUNDAY)).toBe('2026-10-26')
  })

  it('counts week intervals from the start week', () => {
    // Sunday ends its Monday-first week, so the next Monday falls in week 1 and is skipped.
    expect(firstOccurrenceOnOrAfter('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', SUNDAY)).toBe('2026-11-02')
  })

  it.each([
    ['FREQ=MONTHLY;BYMONTHDAY=1', '2026-11-01'],
    ['FREQ=MONTHLY;BYMONTHDAY=-1', '2026-10-31'],
    ['FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1', '2026-11-02'],
    ['FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1', '2026-10-30'],
    [RRULE.lastWorkday, '2026-10-30'],
    [RRULE.firstWorkday, '2026-11-02'],
  ])('finds the monthly occurrence of %s', (rule, first) => {
    expect(firstOccurrenceOnOrAfter(rule, SUNDAY)).toBe(first)
  })

  it('skips months that lack the date and counts month intervals from the start month', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYMONTHDAY=31', '2026-11-01')).toBe('2026-12-31')
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1', SUNDAY)).toBe(
      '2027-01-01',
    )
  })

  it.each(['FREQ=MONTHLY;BYMONTHDAY=1,15', 'FREQ=DAILY;BYDAY=MO,WE'])(
    'keeps the start for the unmodeled %s',
    (rule) => {
      expect(firstOccurrenceOnOrAfter(rule, SUNDAY)).toBe(SUNDAY)
    },
  )
})
