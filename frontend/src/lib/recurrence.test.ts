import { describe, expect, it } from 'vitest'
import {
  buildRRule,
  EMPTY_RECURRENCE,
  parseRRule,
  summarize,
  summarizeRule,
  type RecurrenceValue,
} from './recurrence'

const value = (partial: Partial<RecurrenceValue>): RecurrenceValue => ({
  ...EMPTY_RECURRENCE,
  ...partial,
})

describe('buildRRule', () => {
  it('returns null when the task does not repeat', () => {
    expect(buildRRule(value({ freq: 'none' }))).toBeNull()
  })

  it('builds daily and weekly rules', () => {
    expect(buildRRule(value({ freq: 'daily' }))).toBe('FREQ=DAILY')
    expect(buildRRule(value({ freq: 'weekly' }))).toBe('FREQ=WEEKLY')
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

  it('floors a fractional interval to at least 1', () => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval: 0 }))).toBe(
      'FREQ=DAILY;INTERVAL=1',
    )
  })
})

describe('parseRRule', () => {
  it('treats null/unmodeled rules as "none"', () => {
    expect(parseRRule(null).freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY').freq).toBe('none')
  })

  it('parses the modeled shapes back into the picker form', () => {
    expect(parseRRule('FREQ=DAILY').freq).toBe('daily')
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
  })

  it('round-trips the modeled rules through build → parse → build', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;BYDAY=MO,WE',
      'FREQ=DAILY;INTERVAL=3',
      'FREQ=WEEKLY;INTERVAL=2',
    ]) {
      expect(buildRRule(parseRRule(rule))).toBe(rule)
    }
  })
})

describe('summarize', () => {
  it('describes each shape in plain words', () => {
    expect(summarize(value({ freq: 'none' }))).toBe('Does not repeat')
    expect(summarize(value({ freq: 'daily' }))).toBe('Every day')
    expect(summarize(value({ freq: 'weekly', weekdays: ['WE', 'MO'] }))).toBe('Weekly on Mon, Wed')
    expect(summarize(value({ freq: 'weekly' }))).toBe('Every week')
    expect(summarize(value({ freq: 'custom', unit: 'day', interval: 1 }))).toBe('Every day')
    expect(summarize(value({ freq: 'custom', unit: 'week', interval: 2 }))).toBe('Every 2 weeks')
  })

  it('summarizes straight from a stored rule', () => {
    expect(summarizeRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Weekly on Mon, Wed')
  })
})
