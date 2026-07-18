import { describe, expect, it } from 'vitest'
import { applyUntimedOrder, sortForView, untimedReadingOrder } from './ordering'
import type { TaskGroup } from './grouping'
import type { Label, Task } from './types'

const label = (id: number): Label => ({
  id,
  name: `L${id}`,
  color: '#000000',
  emoji: null,
  sort_order: id,
})

const task = (id: number, over: Partial<Task> = {}): Task => ({
  id,
  title: `T${id}`,
  notes: null,
  label_id: null,
  due_date: '2026-06-01',
  due_time: null,
  recurrence_rule: null,
  occurrence_date: '2026-06-01',
  sort_order: 0,
  completed: false,
  ...over,
})

const timed = (id: number, time: string): Task => task(id, { due_time: time })

describe('untimedReadingOrder', () => {
  it('returns untimed ids in group order then within-group order, excluding timed', () => {
    const groups: TaskGroup[] = [
      { label: label(1), tasks: [timed(10, '09:00'), task(11), task(12)] },
      { label: label(2), tasks: [task(20)] },
      { label: null, tasks: [task(30)] },
    ]
    expect(untimedReadingOrder(groups)).toEqual([11, 12, 20, 30])
  })

  it('is empty when every task is timed', () => {
    const groups: TaskGroup[] = [{ label: null, tasks: [timed(1, '08:00'), timed(2, '09:00')] }]
    expect(untimedReadingOrder(groups)).toEqual([])
  })
})

describe('applyUntimedOrder', () => {
  it('keeps timed tasks leading in their existing order and reorders untimed to ids', () => {
    const tasks = [timed(1, '09:00'), task(2), task(3), task(4)]
    const result = applyUntimedOrder(tasks, [4, 2, 3])
    expect(result.map((t) => t.id)).toEqual([1, 4, 2, 3])
  })

  it('patches sort_order of untimed tasks to their new index', () => {
    const tasks = [task(2), task(3), task(4)]
    const result = applyUntimedOrder(tasks, [4, 2, 3])
    expect(result.map((t) => [t.id, t.sort_order])).toEqual([
      [4, 0],
      [2, 1],
      [3, 2],
    ])
  })

  it('ignores unknown ids and never reorders a timed task into the untimed run', () => {
    const tasks = [timed(1, '09:00'), task(2)]
    const result = applyUntimedOrder(tasks, [99, 1, 2])
    expect(result.map((t) => t.id)).toEqual([1, 2])
  })

  it('preserves untimed tasks on OTHER days when reordering one day of a range', () => {
    const tasks = [
      task(1, { occurrence_date: '2026-06-02', due_date: '2026-06-02', sort_order: 0 }),
      task(2, { occurrence_date: '2026-06-02', due_date: '2026-06-02', sort_order: 1 }),
      task(9, { occurrence_date: '2026-06-05', due_date: '2026-06-05', sort_order: 0 }),
    ]
    const result = applyUntimedOrder(tasks, [2, 1])
    expect(result.map((t) => t.id)).toEqual([2, 1, 9])
    expect(result.find((t) => t.id === 9)).toBeTruthy()
  })
})

describe('sortForView', () => {
  it('orders by occurrence day, then timed-first by time, then sort_order, then id', () => {
    const tasks = [
      task(5, { occurrence_date: '2026-06-02', due_date: '2026-06-02', sort_order: 1 }),
      task(4, { occurrence_date: '2026-06-02', due_date: '2026-06-02', sort_order: 0 }),
      timed(3, '09:00'), // 2026-06-01, timed
      task(2, { sort_order: 5 }), // 2026-06-01, untimed
      timed(1, '08:00'), // 2026-06-01, timed, earlier
    ]
    expect(sortForView(tasks).map((t) => t.id)).toEqual([1, 3, 2, 4, 5])
  })

  it('breaks ties on id and returns a new array (no mutation)', () => {
    const tasks = [task(9, { sort_order: 0 }), task(2, { sort_order: 0 })]
    const snapshot = [...tasks]
    expect(sortForView(tasks).map((t) => t.id)).toEqual([2, 9])
    expect(tasks).toEqual(snapshot) // input order untouched
  })
})
