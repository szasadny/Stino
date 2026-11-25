import { describe, expect, it } from 'vitest'
import { WORKDAY_CODE } from './model'
import {
  MONTHDAY_OPTIONS,
  MONTH_WEEKDAY_OPTIONS,
  WEEKDAY_OPTIONS,
  monthWeekdayLabel,
  positionLabel,
  weekdayLabel,
} from './options'

describe('picker options', () => {
  it('lists the weekdays Monday-first with short labels', () => {
    expect(WEEKDAY_OPTIONS.map((o) => `${o.code}:${o.label}`)).toEqual([
      'MO:Mon',
      'TU:Tue',
      'WE:Wed',
      'TH:Thu',
      'FR:Fri',
      'SA:Sat',
      'SU:Sun',
    ])
  })

  it('lists every day a month can have', () => {
    expect(MONTHDAY_OPTIONS).toHaveLength(31)
    expect([MONTHDAY_OPTIONS[0], MONTHDAY_OPTIONS.at(-1)]).toEqual([1, 31])
  })

  it('offers the workday ahead of the long weekday names for monthly rules', () => {
    expect(MONTH_WEEKDAY_OPTIONS[0]).toEqual({ code: WORKDAY_CODE, label: 'Workday' })
    expect(MONTH_WEEKDAY_OPTIONS.map((o) => o.label).slice(1)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })
})

describe('labels', () => {
  it('names positions and weekdays as the summary reads them', () => {
    expect(positionLabel(-1)).toBe('Last')
    expect(positionLabel(2)).toBe('Second')
    expect(weekdayLabel('TH')).toBe('Thu')
    expect(monthWeekdayLabel(WORKDAY_CODE)).toBe('workday')
    expect(monthWeekdayLabel('FR')).toBe('Fri')
  })
})
