import { describe, expect, it } from 'vitest'
import { replaceOccurrence } from './task-actions'
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
    // Same id, two occurrence days: only the matching one flips.
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
