import { describe, expect, it } from 'vitest'
import { dayViewGroups, groupByDate, groupByLabel, labelDayOrder } from './grouping'
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
    expect(groups[2].tasks.map((t) => t.id)).toEqual([12, 13])
  })

  it('omits a label with no tasks', () => {
    const groups = groupByLabel([task(1, 1)], [label(1, 0), label(2, 1)])
    expect(groups.map((g) => g.label?.id)).toEqual([1])
  })
})

describe('labelDayOrder', () => {
  const timed = (id: number, label_id: number | null, due_time: string): Task => ({
    ...task(id, label_id),
    due_time,
  })

  it('returns [] for no tasks', () => {
    expect(labelDayOrder([], [label(1, 0)])).toEqual([])
  })

  it('keeps timed tasks first in input (time) order regardless of label', () => {
    const labels = [label(2, 0), label(1, 1)]
    const tasks = [
      timed(10, 1, '09:00'),
      timed(11, 2, '14:00'),
      task(12, 2),
      task(13, 1),
      task(14, null),
    ]
    expect(labelDayOrder(tasks, labels).map((t) => t.id)).toEqual([10, 11, 12, 13, 14])
  })

  it('orders untimed by label sort_order and preserves within-label input order', () => {
    const labels = [label(2, 0), label(1, 1)]
    const tasks = [task(10, 1), task(11, 2), task(12, 1)]
    expect(labelDayOrder(tasks, labels).map((t) => t.id)).toEqual([11, 10, 12])
  })

  it('puts unlabeled and unknown-label tasks last, in input order', () => {
    const labels = [label(1, 0)]
    const tasks = [task(10, null), task(11, 99), task(12, 1)]
    expect(labelDayOrder(tasks, labels).map((t) => t.id)).toEqual([12, 10, 11])
  })

  it('is the identity for an all-unlabeled day', () => {
    const tasks = [task(10, null), task(11, null), timed(12, null, '08:00')]
    const input = [tasks[2], tasks[0], tasks[1]]
    expect(labelDayOrder(input, [label(1, 0)])).toEqual(input)
  })
})

describe('dayViewGroups', () => {
  it('groups by label when grouped', () => {
    const labels = [label(2, 0), label(1, 1)]
    const tasks = [task(10, 1), task(11, 2), task(12, null)]
    const groups = dayViewGroups(tasks, labels, true)
    expect(groups.map((g) => g.label?.id ?? null)).toEqual([2, 1, null])
  })

  it('flat mode is a single unlabeled section holding every task in order', () => {
    const tasks = [task(10, 1), task(11, 2), task(12, null)]
    const groups = dayViewGroups(tasks, [label(1, 0), label(2, 1)], false)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBeNull()
    expect(groups[0].tasks.map((t) => t.id)).toEqual([10, 11, 12])
  })

  it('yields no sections for no tasks in either mode', () => {
    expect(dayViewGroups([], [label(1, 0)], false)).toEqual([])
    expect(dayViewGroups([], [label(1, 0)], true)).toEqual([])
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
