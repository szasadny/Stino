import { describe, expect, it } from 'vitest'
import { MON, NEXT_MON, RRULE, TUE, WED, makeTask, on, recurring, timed } from '../test/factories'
import {
  canSkipOccurrence,
  isRecurring,
  isUntimed,
  occurrenceKey,
  sameOccurrence,
  skippableOccurrence,
} from './predicates'

const weeklyRow = (completed = false) =>
  recurring({ ...on(NEXT_MON), due_date: MON, completed }, RRULE.weekly)

describe('isUntimed / isRecurring', () => {
  it('reads the time and the rule', () => {
    expect(isUntimed(on(MON))).toBe(true)
    expect(isUntimed(timed('09:00'))).toBe(false)
    expect(isRecurring(recurring())).toBe(true)
    expect(isRecurring(on(MON))).toBe(false)
  })
})

describe('sameOccurrence', () => {
  it('needs both the id and the occurrence date to match', () => {
    expect(sameOccurrence(on(MON, { id: 7 }), on(MON, { id: 7 }))).toBe(true)
    expect(sameOccurrence(on(MON, { id: 7 }), on(TUE, { id: 7 }))).toBe(false)
    expect(sameOccurrence(on(MON, { id: 7 }), on(MON, { id: 8 }))).toBe(false)
  })
})

describe('occurrenceKey', () => {
  it('is unique per (id, occurrence day) so a recurring id never collides', () => {
    const a = on(MON, { id: 7 })
    const b = on(TUE, { id: 7 })
    expect(occurrenceKey(a)).not.toBe(occurrenceKey(b))
    expect(occurrenceKey(a)).toBe(`7:${MON}`)
  })

  it('falls back to due_date when there is no occurrence_date', () => {
    expect(occurrenceKey(makeTask({ id: 3, due_date: WED }))).toBe(`3:${WED}`)
  })
})

describe('skippableOccurrence', () => {
  it('returns the instance date of a recurring row', () => {
    expect(skippableOccurrence(weeklyRow())).toBe(NEXT_MON)
  })

  it('is null for a one-off (delete removes the task itself)', () => {
    expect(skippableOccurrence(on(NEXT_MON))).toBeNull()
    expect(skippableOccurrence(on(null, { id: 2 }))).toBeNull()
  })
})

describe('canSkipOccurrence', () => {
  it('allows an unfinished recurring occurrence', () => {
    expect(canSkipOccurrence(weeklyRow(false))).toBe(true)
  })

  it('refuses a completed occurrence (completions are kept)', () => {
    expect(canSkipOccurrence(weeklyRow(true))).toBe(false)
  })

  it('refuses a one-off', () => {
    expect(canSkipOccurrence(on(NEXT_MON))).toBe(false)
  })
})
