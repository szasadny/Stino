import { describe, expect, it } from 'vitest'
import { MON, RRULE, THU, TUE, WED, makeLabel, on, recurring } from '../test/factories'
import type { Label, Task } from '../types'
import { buildBoard, dayViewGroups, hasLabelGroups, withoutMissedOccurrences } from './projection'

const ids = (items: { id: number }[]) => items.map((t) => t.id)
const labeled = (id: number, label_id: number | null, over: Partial<Task> = {}) =>
  on(MON, { id, label_id, ...over })
const boardIds = (board: ReturnType<typeof buildBoard>, key: string) =>
  board[key]?.map((it) => it.task.id)
const dayOrder = (tasks: Task[], labels: Label[]) =>
  buildBoard(tasks, [MON], labels)[MON]?.map((it) => it.task)

describe('dayViewGroups grouped by label', () => {
  it('returns nothing for no tasks', () => {
    expect(dayViewGroups([], [makeLabel()], true)).toEqual([])
  })

  it('orders labeled groups by label sort_order with "No label" last', () => {
    const labels = [makeLabel({ id: 2, sort_order: 0 }), makeLabel({ id: 1, sort_order: 1 })]
    const tasks = [labeled(10, 1), labeled(11, 2), labeled(12, null), labeled(13, 99)]
    const groups = dayViewGroups(tasks, labels, true)
    expect(groups.map((g) => g.label?.id ?? null)).toEqual([2, 1, null])
    expect(groups.map((g) => ids(g.tasks))).toEqual([[11], [10], [12, 13]])
  })

  it('omits a label with no tasks', () => {
    const labels = [makeLabel({ id: 1, sort_order: 0 }), makeLabel({ id: 2, sort_order: 1 })]
    const groups = dayViewGroups([labeled(1, 1)], labels, true)
    expect(groups.map((g) => g.label?.id)).toEqual([1])
  })
})

describe('dayViewGroups', () => {
  const labels = [makeLabel({ id: 2, sort_order: 0 }), makeLabel({ id: 1, sort_order: 1 })]

  it('groups by label when grouped', () => {
    const tasks = [labeled(10, 1), labeled(11, 2), labeled(12, null)]
    const groups = dayViewGroups(tasks, labels, true)
    expect(groups.map((g) => g.label?.id ?? null)).toEqual([2, 1, null])
  })

  it('flat mode is a single unlabeled section holding every task in order', () => {
    const tasks = [labeled(10, 1), labeled(11, 2), labeled(12, null)]
    const groups = dayViewGroups(tasks, labels, false)
    expect(groups).toHaveLength(1)
    expect(groups.map((g) => g.label)).toEqual([null])
    expect(groups.map((g) => ids(g.tasks))).toEqual([[10, 11, 12]])
  })

  it('yields no sections for no tasks in either mode', () => {
    expect(dayViewGroups([], labels, false)).toEqual([])
    expect(dayViewGroups([], labels, true)).toEqual([])
  })
})

describe('buildBoard label order', () => {
  const labels = [makeLabel({ id: 2, sort_order: 0 }), makeLabel({ id: 1, sort_order: 1 })]

  it('returns [] for no tasks', () => {
    expect(dayOrder([], labels)).toEqual([])
  })

  it('keeps timed tasks first in input (time) order regardless of label', () => {
    const tasks = [
      labeled(10, 1, { due_time: '09:00' }),
      labeled(11, 2, { due_time: '14:00' }),
      labeled(12, 2),
      labeled(13, 1),
      labeled(14, null),
    ]
    expect(dayOrder(tasks, labels)?.map((t) => t.id)).toEqual([10, 11, 12, 13, 14])
  })

  it('orders untimed by label sort_order and preserves within-label input order', () => {
    const tasks = [labeled(10, 1), labeled(11, 2), labeled(12, 1)]
    expect(dayOrder(tasks, labels)?.map((t) => t.id)).toEqual([11, 10, 12])
  })

  it('puts unlabeled and unknown-label tasks last, in input order', () => {
    const tasks = [labeled(10, null), labeled(11, 99), labeled(12, 1)]
    expect(dayOrder(tasks, [makeLabel({ id: 1 })])?.map((t) => t.id)).toEqual([12, 10, 11])
  })

  it('is the identity for an all-unlabeled day', () => {
    const input = [labeled(12, null, { due_time: '08:00' }), labeled(10, null), labeled(11, null)]
    expect(dayOrder(input, [makeLabel({ id: 1 })])).toEqual(input)
  })
})

describe('buildBoard', () => {
  const keys = [MON, TUE, WED]

  it('seeds every grid key, including empty days, as a drop target', () => {
    const board = buildBoard([on(MON)], keys)
    expect(Object.keys(board)).toEqual(keys)
    expect(board[TUE]).toEqual([])
    expect(board[WED]).toEqual([])
  })

  it('skips unscheduled tasks and tasks outside the grid', () => {
    const board = buildBoard([on(null, { id: 1 }), on('2026-07-01', { id: 2 })], keys)
    expect(board[MON]).toEqual([])
    expect(Object.values(board).flat()).toEqual([])
  })

  it('preserves per-day input order', () => {
    const board = buildBoard([on(MON, { id: 2 }), on(MON, { id: 1 })], keys)
    expect(boardIds(board, MON)).toEqual([2, 1])
  })

  it('sinks completed tasks below unfinished ones, keeping order within each half', () => {
    const board = buildBoard(
      [
        on(MON, { id: 1, completed: true }),
        on(MON, { id: 2 }),
        on(MON, { id: 3, completed: true }),
        on(MON, { id: 4 }),
      ],
      keys,
    )
    expect(boardIds(board, MON)).toEqual([2, 4, 1, 3])
  })

  it('gives a recurring id landing on two days distinct item ids', () => {
    const board = buildBoard([on(MON, { id: 7 }), on(TUE, { id: 7 })], keys)
    expect(board[MON]?.[0]?.id).toBe(`7:${MON}`)
    expect(board[TUE]?.[0]?.id).toBe(`7:${TUE}`)
  })

  describe('with labelOrder', () => {
    const labels = [makeLabel({ id: 2, sort_order: 0 }), makeLabel({ id: 1, sort_order: 1 })]

    it('projects each day into label order, timed leading', () => {
      const board = buildBoard(
        [
          on(MON, { id: 1, label_id: 1, due_time: '09:00' }),
          on(MON, { id: 2, label_id: 1 }),
          on(MON, { id: 3, label_id: 2 }),
          on(MON, { id: 4 }),
          on(TUE, { id: 5, label_id: 1 }),
        ],
        keys,
        labels,
      )
      expect(boardIds(board, MON)).toEqual([1, 3, 2, 4])
      expect(boardIds(board, TUE)).toEqual([5])
    })

    it('sinks completed tasks below the label-ordered unfinished ones', () => {
      const board = buildBoard(
        [
          on(MON, { id: 1, label_id: 2, completed: true }),
          on(MON, { id: 2, label_id: 1 }),
          on(MON, { id: 3, label_id: 2 }),
          on(MON, { id: 4, due_time: '09:00', completed: true }),
        ],
        keys,
        labels,
      )
      expect(boardIds(board, MON)).toEqual([3, 2, 4, 1])
    })

    it('still seeds empty days and keeps occurrence keys intact', () => {
      const board = buildBoard([on(MON, { id: 7, label_id: 1 })], keys, labels)
      expect(board[TUE]).toEqual([])
      expect(board[MON]?.[0]?.id).toBe(`7:${MON}`)
    })
  })
})

describe('withoutMissedOccurrences', () => {
  it('drops only unticked past occurrences of a series', () => {
    const daily = (date: string, completed = false) =>
      recurring(on(date, { completed }), RRULE.daily)
    const list = [daily(MON), daily(TUE, true), daily(WED), daily(THU), on(MON, { id: 2 })]
    const out = withoutMissedOccurrences(list, WED)
    expect(out.map((t) => [t.id, t.occurrence_date])).toEqual([
      [1, TUE],
      [1, WED],
      [1, THU],
      [2, MON],
    ])
  })
})

describe('hasLabelGroups', () => {
  const home = makeLabel({ id: 1 })

  it('is true once a task carries a label that still exists', () => {
    expect(hasLabelGroups([labeled(1, null), labeled(2, 1)], [home])).toBe(true)
  })

  it('ignores unlabeled tasks and deleted labels', () => {
    expect(hasLabelGroups([labeled(1, null), labeled(2, 9)], [home])).toBe(false)
  })
})
