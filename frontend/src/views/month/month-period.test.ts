import { describe, expect, it } from 'vitest'
import { toISODate } from '../../lib/date'
import { monthRange, monthStart, stepMonth, withDay } from './month-period'

const JUNE_2026 = new Date(2026, 5, 1)
const JUNE_GRID: [string, string] = ['2026-06-01', '2026-07-12']

describe('monthStart / stepMonth', () => {
  it('normalises any day to the first of its month', () => {
    expect(toISODate(monthStart(new Date(2026, 5, 24)))).toBe('2026-06-01')
  })

  it('steps across year boundaries', () => {
    expect(toISODate(stepMonth(new Date(2026, 11, 1), 1))).toBe('2027-01-01')
    expect(toISODate(stepMonth(new Date(2026, 0, 1), -1))).toBe('2025-12-01')
  })
})

describe('monthRange', () => {
  it('covers the whole six-week grid', () => {
    expect(monthRange(JUNE_2026, null)).toEqual(JUNE_GRID)
  })

  it('stretches to keep a selected day outside the grid', () => {
    expect(monthRange(JUNE_2026, '2026-05-20')).toEqual(['2026-05-20', JUNE_GRID[1]])
    expect(monthRange(JUNE_2026, '2026-08-03')).toEqual([JUNE_GRID[0], '2026-08-03'])
    expect(monthRange(JUNE_2026, '2026-06-15')).toEqual(JUNE_GRID)
  })
})

describe('withDay', () => {
  it('appends a day only when it is missing', () => {
    expect(withDay(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(withDay(['a', 'b'], 'b')).toEqual(['a', 'b'])
    expect(withDay(['a'], null)).toEqual(['a'])
  })
})
