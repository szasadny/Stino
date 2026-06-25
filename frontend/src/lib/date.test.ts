import { describe, expect, it } from 'vitest'
import {
  addMonths,
  addWeeks,
  buildMonthGrid,
  buildWeekGrid,
  formatDayFull,
  formatMonthYear,
  formatShortDate,
  formatWeekRange,
  fromISODate,
  isSameMonth,
  monthWeekCount,
  startOfWeek,
  toISODate,
  weekdayAbbrev,
} from './date'

// Dates are built from local Y/M/D components, so these are timezone-independent
// (the same calendar date everywhere) — see Hard Rule 7.

describe('toISODate / fromISODate', () => {
  it('formats a local date as YYYY-MM-DD without UTC drift', () => {
    expect(toISODate(new Date(2026, 5, 24))).toBe('2026-06-24')
  })

  it('round-trips through fromISODate', () => {
    const iso = '2026-06-24'
    const d = fromISODate(iso)
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 24])
    expect(toISODate(d)).toBe(iso)
  })
})

describe('month grid + navigation', () => {
  it('builds a 42-cell Monday-first grid covering the month', () => {
    const grid = buildMonthGrid(2026, 5) // June 2026; the 1st is a Monday
    expect(grid).toHaveLength(42)
    expect(toISODate(grid[0])).toBe('2026-06-01')
    expect(toISODate(grid[41])).toBe('2026-07-12')
  })

  it('steps months and rolls the year over', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('knows whether a date is in the given month', () => {
    expect(isSameMonth(new Date(2026, 5, 30), 5)).toBe(true)
    expect(isSameMonth(new Date(2026, 6, 1), 5)).toBe(false)
  })
})

describe('week helpers', () => {
  it('finds Monday of the week and builds 7 days', () => {
    const wed = new Date(2026, 5, 3) // Wednesday
    expect(toISODate(startOfWeek(wed))).toBe('2026-06-01')
    const week = buildWeekGrid(wed)
    expect(week.map(toISODate)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ])
  })

  it('steps by whole weeks', () => {
    expect(toISODate(addWeeks(new Date(2026, 5, 3), 1))).toBe('2026-06-10')
  })
})

describe('formatters', () => {
  it('formats month/year, short date, and weekday', () => {
    expect(formatMonthYear(2026, 5)).toBe('June 2026')
    expect(formatShortDate(new Date(2026, 5, 26))).toBe('Fri 26 June')
    expect(weekdayAbbrev(new Date(2026, 5, 1))).toBe('Mon')
  })

  it('formats a week range, repeating the month only across a boundary', () => {
    expect(formatWeekRange(buildWeekGrid(new Date(2026, 5, 3)))).toBe('1–7 June 2026')
    expect(formatWeekRange(buildWeekGrid(new Date(2026, 5, 30)))).toBe('29 June – 5 July 2026')
  })

  it('formats the full day label with the controlled date part', () => {
    expect(formatDayFull(new Date(2026, 5, 24)).endsWith('24 June')).toBe(true)
  })
})

describe('monthWeekCount', () => {
  it('is 4 for a 28-day February that starts on a Monday', () => {
    expect(monthWeekCount(2021, 1)).toBe(4) // Feb 2021, 1st = Monday
  })

  it('is 5 for June 2026 (1st = Monday, 30 days) — drops the all-spill-over 6th row', () => {
    expect(monthWeekCount(2026, 5)).toBe(5)
  })

  it('is 5 for a 29-day leap February that starts on a Monday', () => {
    expect(monthWeekCount(2016, 1)).toBe(5) // Feb 2016, 1st = Monday, 29 days
  })

  it('is 6 for a 31-day month that starts on a Saturday', () => {
    expect(monthWeekCount(2026, 7)).toBe(6) // Aug 2026, 1st = Saturday
  })

  it('never exceeds the 6-row grid or falls below 4', () => {
    for (let m = 0; m < 12; m++) {
      const n = monthWeekCount(2026, m)
      expect(n).toBeGreaterThanOrEqual(4)
      expect(n).toBeLessThanOrEqual(6)
    }
  })
})
