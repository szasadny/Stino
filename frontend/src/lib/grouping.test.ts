import { describe, expect, it } from 'vitest'
import { groupByDate, groupByLabel } from './grouping'
import type { Label, Task } from './types'

const label = (id: number, sort_order: number): Label => ({
  id,
  name: `L${id}`,
  color: '#000000',
  emoji: null,
  sort_order,
})

const task = (id: number, label_id: number | null): Task => ({
  id,
  title: `T${id}`,
  notes: null,
  label_id,
  due_date: null,
  due_time: null,
  recurrence_rule: null,
  occurrence_date: null,
  sort_order: 0,
  completed: false,
})

describe('groupByLabel', () => {
  it('returns nothing for no tasks', () => {
    expect(groupByLabel([], [label(1, 0)])).toEqual([])
  })

  it('orders labeled groups by label sort_order with "No label" last', () => {
    const labels = [label(2, 0), label(1, 1)]
    const tasks = [task(10, 1), task(11, 2), task(12, null), task(13, 99)]

    const groups = groupByLabel(tasks, labels)

    expect(groups.map((g) => g.label?.id ?? null)).toEqual([2, 1, null])
    expect(groups[0].tasks.map((t) => t.id)).toEqual([11])
    expect(groups[1].tasks.map((t) => t.id)).toEqual([10])
    // Unknown label (99) falls into "No label"; input order is preserved.
    expect(groups[2].tasks.map((t) => t.id)).toEqual([12, 13])
  })

  it('omits a label with no tasks', () => {
    const groups = groupByLabel([task(1, 1)], [label(1, 0), label(2, 1)])
    expect(groups.map((g) => g.label?.id)).toEqual([1])
  })
})

describe('groupByDate', () => {
  const dated = (id: number, occurrence_date: string | null): Task => ({
    ...task(id, null),
    occurrence_date,
  })

  it('omits tasks with no occurrence_date', () => {
    expect(groupByDate([dated(1, null)]).size).toBe(0)
  })

  it('groups by occurrence_date, preserving input order within a day', () => {
    const map = groupByDate([
      dated(1, '2026-06-01'),
      dated(2, '2026-06-01'),
      dated(3, '2026-06-02'),
    ])
    expect(map.get('2026-06-01')?.map((t) => t.id)).toEqual([1, 2])
    expect(map.get('2026-06-02')?.map((t) => t.id)).toEqual([3])
  })

  it('lets one recurring id appear under several days', () => {
    const map = groupByDate([dated(7, '2026-06-01'), dated(7, '2026-06-02')])
    expect(map.get('2026-06-01')?.[0].id).toBe(7)
    expect(map.get('2026-06-02')?.[0].id).toBe(7)
  })
})
