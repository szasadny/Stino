import { describe, expect, it } from 'vitest'
import {
  canSkipOccurrence,
  replaceOccurrence,
  restoreOccurrence,
  skippableOccurrence,
  withoutMissedOccurrences,
  withoutOccurrence,
} from './task-actions'
import type { Task } from './types'

const task = (id: number, occurrence_date: string | null, completed = false): Task => ({
  id,
  title: `T${id}`,
  notes: null,
  label_id: null,
  due_date: occurrence_date,
  due_time: null,
  recurrence_rule: null,
  occurrence_date,
  sort_order: 0,
  completed,
})

describe('replaceOccurrence', () => {
  it('replaces only the row matching (id, occurrence_date)', () => {
    const list = [task(1, '2026-06-01'), task(1, '2026-06-02'), task(2, null)]
    const out = replaceOccurrence(list, task(1, '2026-06-02', true))

    expect(out[0].completed).toBe(false)
    expect(out[1].completed).toBe(true)
    expect(out[2].completed).toBe(false)
  })

  it('matches a null occurrence (an Inbox task)', () => {
    const out = replaceOccurrence([task(2, null)], task(2, null, true))
    expect(out[0].completed).toBe(true)
  })

  it('leaves the list unchanged when nothing matches', () => {
    const list = [task(1, '2026-06-01')]
    expect(replaceOccurrence(list, task(9, '2026-06-01', true))).toEqual(list)
  })
})

describe('skippableOccurrence', () => {
  it('returns the instance date of a recurring row', () => {
    const row = { ...task(1, '2026-06-08'), due_date: '2026-06-01', recurrence_rule: 'FREQ=WEEKLY' }
    expect(skippableOccurrence(row)).toBe('2026-06-08')
  })

  it('is null for a one-off (delete removes the task itself)', () => {
    expect(skippableOccurrence(task(1, '2026-06-08'))).toBeNull()
    expect(skippableOccurrence(task(2, null))).toBeNull()
  })
})

describe('canSkipOccurrence', () => {
  const recurring = (completed: boolean) => ({
    ...task(1, '2026-06-08', completed),
    due_date: '2026-06-01',
    recurrence_rule: 'FREQ=WEEKLY',
  })

  it('allows an unfinished recurring occurrence', () => {
    expect(canSkipOccurrence(recurring(false))).toBe(true)
  })

  it('refuses a completed occurrence (completions are kept)', () => {
    expect(canSkipOccurrence(recurring(true))).toBe(false)
  })

  it('refuses a one-off', () => {
    expect(canSkipOccurrence(task(1, '2026-06-08'))).toBe(false)
  })
})

describe('withoutOccurrence', () => {
  it('drops only the matching (id, occurrence_date) row', () => {
    const list = [task(1, '2026-06-01'), task(1, '2026-06-08'), task(2, '2026-06-08')]
    const out = withoutOccurrence(list, 1, '2026-06-08')
    expect(out.map((t) => [t.id, t.occurrence_date])).toEqual([
      [1, '2026-06-01'],
      [2, '2026-06-08'],
    ])
  })
})

describe('restoreOccurrence', () => {
  const ids = (list: Task[]) => list.map((t) => t.id)

  it('reinserts at the original index', () => {
    const out = restoreOccurrence([task(1, null), task(3, null)], task(2, null), 1)
    expect(ids(out)).toEqual([1, 2, 3])
  })

  it('clamps an index past the end to an append', () => {
    expect(ids(restoreOccurrence([task(1, null)], task(2, null), 5))).toEqual([1, 2])
    expect(ids(restoreOccurrence([task(1, null)], task(2, null), -1))).toEqual([2, 1])
  })

  it('replaces a row that is already present instead of duplicating it', () => {
    const out = restoreOccurrence([task(1, null), task(2, null)], task(2, null, true), 0)
    expect(ids(out)).toEqual([1, 2])
    expect(out[1].completed).toBe(true)
  })
})

describe('withoutMissedOccurrences', () => {
  const recurring = (date: string, completed = false): Task => ({
    ...task(1, date, completed),
    recurrence_rule: 'FREQ=DAILY',
  })

  it('drops only unticked past occurrences of a series', () => {
    const list = [
      recurring('2026-06-01'),
      recurring('2026-06-02', true),
      recurring('2026-06-03'),
      recurring('2026-06-04'),
      task(2, '2026-06-01'),
    ]
    const out = withoutMissedOccurrences(list, '2026-06-03')

    expect(out.map((t) => [t.id, t.occurrence_date])).toEqual([
      [1, '2026-06-02'],
      [1, '2026-06-03'],
      [1, '2026-06-04'],
      [2, '2026-06-01'],
    ])
  })
})
