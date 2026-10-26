import { describe, expect, it } from 'vitest'
import { firstOccurrenceOnOrAfter } from './first-occurrence'

// Sunday 25 October 2026.
const SUNDAY = '2026-10-25'

describe('firstOccurrenceOnOrAfter', () => {
  it('keeps a start the rule already generates', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=DAILY', SUNDAY)).toBe(SUNDAY)
    expect(firstOccurrenceOnOrAfter('FREQ=WEEKLY', SUNDAY)).toBe(SUNDAY)
    expect(firstOccurrenceOnOrAfter('FREQ=YEARLY', SUNDAY)).toBe(SUNDAY)
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYMONTHDAY=25', SUNDAY)).toBe(SUNDAY)
  })

  it('moves to the next chosen weekday', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=WEEKLY;BYDAY=MO', SUNDAY)).toBe('2026-10-26')
    expect(firstOccurrenceOnOrAfter('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', SUNDAY)).toBe('2026-10-26')
  })

  it('counts week intervals from the start week', () => {
    // Sunday ends its Monday-first week, so the next Monday falls in week 1 and is skipped.
    expect(firstOccurrenceOnOrAfter('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', SUNDAY)).toBe('2026-11-02')
  })

  it('finds monthly date and Nth-weekday occurrences', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYMONTHDAY=1', SUNDAY)).toBe('2026-11-01')
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYMONTHDAY=-1', SUNDAY)).toBe('2026-10-31')
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1', SUNDAY)).toBe('2026-11-02')
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1', SUNDAY)).toBe('2026-10-30')
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', SUNDAY)).toBe(
      '2026-10-30',
    )
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1', SUNDAY)).toBe(
      '2026-11-02',
    )
  })

  it('skips months that lack the date and counts month intervals from the start month', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYMONTHDAY=31', '2026-11-01')).toBe('2026-12-31')
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1', SUNDAY)).toBe(
      '2027-01-01',
    )
  })

  it('keeps the start for an unmodeled rule', () => {
    expect(firstOccurrenceOnOrAfter('FREQ=MONTHLY;BYMONTHDAY=1,15', SUNDAY)).toBe(SUNDAY)
  })
})
