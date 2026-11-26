import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  addMonths,
  addWeeks,
  buildMonthGrid,
  buildWeekGrid,
  currentDateKey,
  daysInMonth,
  firstOfMonth,
  formatDayFull,
  formatMonthYear,
  formatShortDate,
  formatWeekRange,
  formatWeekRangeCompact,
  fromISODate,
  fromRRuleDate,
  isPlausibleISODate,
  isSameMonth,
  mondayIndex,
  quickDates,
  monthWeekCount,
  monthsBetween,
  spanBounds,
  startOfWeek,
  toISODate,
  toLocalTime,
  toRRuleDate,
  weekdayAbbrev,
  weekdayLong,
} from './date'
import { FRI, MON, REF_SUNDAY, REF_THURSDAY, THU, TUE, WED } from './test/factories'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('toISODate', () => {
  it('formats a local date as YYYY-MM-DD without UTC drift', () => {
    expect(toISODate(new Date(2026, 5, 24))).toBe('2026-06-24')
  })
})

describe('currentDateKey', () => {
  it("reads the device clock's local calendar date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59))
    expect(currentDateKey()).toBe('2026-12-31')
  })
})

describe('fromISODate', () => {
  it('round-trips a local date', () => {
    const iso = '2026-06-24'
    const d = fromISODate(iso)
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 24])
    expect(toISODate(d)).toBe(iso)
  })

  it('lands on local midnight', () => {
    const d = fromISODate('2026-03-29')
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0])
  })

  it('keeps a two-digit year literal instead of mapping it to 19xx', () => {
    expect(fromISODate('0042-03-04').getFullYear()).toBe(42)
  })

  it.each(['', '2026-1-5', 'June 24', '2026-06-24T10:00'])('is an Invalid Date for %j', (iso) => {
    expect(Number.isNaN(fromISODate(iso).getTime())).toBe(true)
  })
})

describe('isPlausibleISODate', () => {
  it.each(['2026-11-05', '2028-02-29'])('accepts the real date %s', (iso) => {
    expect(isPlausibleISODate(iso)).toBe(true)
  })

  it.each(['0002-11-05', '0020-11-05', '0202-11-05', '30000-11-05'])(
    'rejects %s, a partial year Chromium emits while the year is typed',
    (iso) => {
      expect(isPlausibleISODate(iso)).toBe(false)
    },
  )

  it.each(['', '2026-1-5', '2026-02-30', '2027-02-29'])(
    'rejects the malformed or impossible %j',
    (iso) => {
      expect(isPlausibleISODate(iso)).toBe(false)
    },
  )
})

describe('toLocalTime', () => {
  it('formats the local wall-clock time as HH:MM', () => {
    expect(toLocalTime(new Date(2026, 5, 24, 9, 5))).toBe('09:05')
    expect(toLocalTime(new Date(2026, 5, 24, 18, 30))).toBe('18:30')
  })
})

describe('toRRuleDate / fromRRuleDate', () => {
  it('converts between the ISO and RRULE basic date forms', () => {
    expect(toRRuleDate('2026-12-31')).toBe('20261231')
    expect(fromRRuleDate('20261231')).toBe('2026-12-31')
  })

  it('reads the date part of a UTC date-time UNTIL', () => {
    expect(fromRRuleDate(' 20260520T000000Z')).toBe('2026-05-20')
  })

  it('is null for anything that is not a basic date', () => {
    expect(fromRRuleDate('2026-05-20')).toBeNull()
    expect(fromRRuleDate('garbage')).toBeNull()
  })
})

describe('mondayIndex', () => {
  it('counts Monday as 0 and Sunday as 6', () => {
    expect(mondayIndex(fromISODate(MON))).toBe(0)
    expect(mondayIndex(fromISODate(WED))).toBe(2)
    expect(mondayIndex(REF_SUNDAY)).toBe(6)
  })
})

describe('buildMonthGrid', () => {
  it('builds a 42-cell Monday-first grid covering the month', () => {
    const grid = buildMonthGrid(2026, 5)
    expect(grid).toHaveLength(42)
    expect(spanBounds(grid)).toEqual([MON, '2026-07-12'])
  })
})

describe('addMonths', () => {
  it('steps months and rolls the year over', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })
})

describe('isSameMonth', () => {
  it('knows whether a date is in the given month', () => {
    expect(isSameMonth(new Date(2026, 5, 30), 5)).toBe(true)
    expect(isSameMonth(new Date(2026, 6, 1), 5)).toBe(false)
  })
})

describe('firstOfMonth / daysInMonth', () => {
  it('finds the first day and the length of a month', () => {
    expect(toISODate(firstOfMonth(2026, 5))).toBe(MON)
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2028, 1)).toBe(29)
    expect(daysInMonth(2026, 11)).toBe(31)
  })
})

describe('monthsBetween', () => {
  it('counts whole calendar months between two dates, across years', () => {
    expect(monthsBetween(new Date(2026, 9, 25), new Date(2027, 0, 1))).toBe(3)
    expect(monthsBetween(new Date(2026, 5, 30), new Date(2026, 5, 1))).toBe(0)
    expect(monthsBetween(new Date(2027, 0, 1), new Date(2026, 11, 31))).toBe(-1)
  })
})

describe('startOfWeek / buildWeekGrid', () => {
  it('finds Monday of the week and builds 7 days', () => {
    const wed = fromISODate(WED)
    expect(toISODate(startOfWeek(wed))).toBe(MON)
    expect(buildWeekGrid(wed).map(toISODate)).toEqual([
      MON,
      TUE,
      WED,
      THU,
      FRI,
      '2026-06-06',
      '2026-06-07',
    ])
  })
})

describe('addWeeks / addDays', () => {
  it('steps by whole weeks', () => {
    expect(toISODate(addWeeks(fromISODate(WED), 1))).toBe('2026-06-10')
  })

  it('steps by calendar days across month and year ends', () => {
    expect(toISODate(addDays(new Date(2026, 5, 30), 1))).toBe('2026-07-01')
    expect(toISODate(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01')
    expect(toISODate(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28')
  })
})

describe('quickDates', () => {
  it('offers today, tomorrow and the same weekday next week', () => {
    expect(quickDates(REF_THURSDAY)).toEqual({
      today: '2026-06-25',
      tomorrow: '2026-06-26',
      nextWeek: '2026-07-02',
    })
  })

  it('crosses a year end', () => {
    expect(quickDates(new Date(2026, 11, 31))).toEqual({
      today: '2026-12-31',
      tomorrow: '2027-01-01',
      nextWeek: '2027-01-07',
    })
  })
})

describe('spanBounds', () => {
  it('bounds a span by its first and last day', () => {
    expect(spanBounds(buildWeekGrid(fromISODate(WED)))).toEqual([MON, '2026-06-07'])
  })
})

describe('formatMonthYear / formatShortDate / weekdayAbbrev', () => {
  it('formats month/year, short date, and weekday', () => {
    expect(formatMonthYear(2026, 5)).toBe('June 2026')
    expect(formatShortDate('2026-06-26')).toBe('Fri 26 June')
    expect(weekdayAbbrev(fromISODate(MON))).toBe('Mon')
  })

  it('shows the year only for a date outside the current one', () => {
    expect(formatShortDate('2026-06-26', 2026)).toBe('Fri 26 June')
    expect(formatShortDate('2024-03-01', 2026)).toBe('Fri 1 March 2024')
    expect(formatShortDate('2027-01-04', 2026)).toBe('Mon 4 January 2027')
  })
})

describe('formatWeekRange', () => {
  it('formats a week range, repeating the month only across a boundary', () => {
    expect(formatWeekRange(buildWeekGrid(new Date(2026, 5, 3)))).toBe('1–7 June 2026')
    expect(formatWeekRange(buildWeekGrid(new Date(2026, 5, 30)))).toBe('29 June – 5 July 2026')
  })
})

describe('formatWeekRangeCompact', () => {
  it('uses short months and shows the year only outside the current one', () => {
    expect(formatWeekRangeCompact(buildWeekGrid(new Date(2026, 5, 3)), 2026)).toBe('1–7 Jun')
    expect(formatWeekRangeCompact(buildWeekGrid(new Date(2026, 9, 26)), 2026)).toBe(
      '26 Oct – 1 Nov',
    )
    expect(formatWeekRangeCompact(buildWeekGrid(new Date(2026, 9, 26)), 2025)).toBe(
      '26 Oct – 1 Nov 2026',
    )
    expect(formatWeekRangeCompact(buildWeekGrid(new Date(2026, 11, 30)), 2026)).toBe(
      '28 Dec – 3 Jan 2027',
    )
  })
})

describe('formatDayFull / weekdayLong', () => {
  it('formats the full day label', () => {
    expect(formatDayFull(new Date(2026, 5, 24))).toBe('Wednesday, 24 June')
    expect(formatDayFull(REF_THURSDAY)).toBe('Thursday, 25 June')
  })

  it('names the weekday in English whatever the browser locale', () => {
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('woensdag')
    expect(weekdayLong(new Date(2026, 5, 24))).toBe('Wednesday')
    expect(formatDayFull(new Date(2026, 5, 24))).toBe('Wednesday, 24 June')
  })
})

describe('monthWeekCount', () => {
  it.each([
    [2021, 1, 4, 'a 28-day February that starts on a Monday'],
    [2026, 5, 5, 'June 2026 (1st = Monday, 30 days), dropping the all-spill-over 6th row'],
    [2016, 1, 5, 'a 29-day leap February that starts on a Monday'],
    [2026, 7, 6, 'a 31-day month that starts on a Saturday'],
  ])('%i-%i has %i rows: %s', (year, month, rows) => {
    expect(monthWeekCount(year, month)).toBe(rows)
  })

  it.each(Array.from({ length: 12 }, (_, month) => month))(
    'month %i of 2026 stays within the 4–6 row grid',
    (month) => {
      const n = monthWeekCount(2026, month)
      expect(n).toBeGreaterThanOrEqual(4)
      expect(n).toBeLessThanOrEqual(6)
    },
  )
})
