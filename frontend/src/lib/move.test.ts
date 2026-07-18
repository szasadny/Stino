import { describe, expect, it } from 'vitest'
import { TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { applyMove, dropKind } from './move'
import { cellItemId, type CellItem } from './calendar-board'
import type { Task } from './types'

const task = (id: number, occurrence_date: string | null, over: Partial<Task> = {}): Task => ({
  id,
  title: `T${id}`,
  notes: null,
  label_id: null,
  due_date: occurrence_date,
  due_time: null,
  recurrence_rule: null,
  occurrence_date,
  sort_order: 0,
  completed: false,
  ...over,
})

const item = (t: Task): CellItem => ({ id: cellItemId(t), task: t })

const event = (
  items: CellItem[],
  trigger: (typeof TRIGGERS)[keyof typeof TRIGGERS],
  id: string,
): CustomEvent<DndEvent<CellItem>> =>
  ({ detail: { items, info: { trigger, id, source: 'pointer' } } }) as unknown as CustomEvent<
    DndEvent<CellItem>
  >

describe('dropKind', () => {
  it('ignores a source zone (item left it — not the landing zone)', () => {
    const moved = task(9, '2026-06-01')
    const e = event([], TRIGGERS.DROPPED_INTO_ANOTHER, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [moved])).toEqual({ kind: 'none' })
  })

  it('reorders within the day on a same-day untimed drop (the cell owns untimed order)', () => {
    const a = task(1, '2026-06-02')
    const moved = task(9, '2026-06-02')
    const e = event([item(moved), item(a)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [a, moved])).toEqual({ kind: 'reorder', ids: [9, 1] })
  })

  it('excludes timed pills from a same-day reorder (they sort by time)', () => {
    const timedPin = task(1, '2026-06-02', { due_time: '09:00' })
    const moved = task(9, '2026-06-02')
    const e = event([item(moved), item(timedPin)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [timedPin, moved])).toEqual({ kind: 'reorder', ids: [9] })
  })

  it('ignores a same-day drop of a timed pill (it is pinned by time)', () => {
    const moved = task(9, '2026-06-02', { due_time: '09:00' })
    const e = event([item(moved)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [moved])).toEqual({ kind: 'none' })
  })

  it('moves only the dragged instance of a recurring task to another day', () => {
    const moved = task(9, '2026-06-01', { recurrence_rule: 'FREQ=DAILY' })
    const e = event([item(moved)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [moved])).toEqual({
      kind: 'move-occurrence',
      taskId: 9,
      occurrenceDate: '2026-06-01',
      newDate: '2026-06-02',
    })
  })

  it('ignores a same-day drop of a recurring instance (it is pinned to its day)', () => {
    const moved = task(9, '2026-06-02', { recurrence_rule: 'FREQ=DAILY' })
    const e = event([item(moved)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [moved])).toEqual({ kind: 'none' })
  })

  it('ignores a drop whose moved id is not among the items', () => {
    const e = event([], TRIGGERS.DROPPED_INTO_ZONE, '99:2026-06-01')
    expect(dropKind(e, '2026-06-02', [])).toEqual({ kind: 'none' })
  })

  it('moves an untimed task with the dest day order to persist', () => {
    const moved = task(9, '2026-06-01')
    const existing = task(1, '2026-06-02')
    const e = event([item(existing), item(moved)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [existing, moved])).toEqual({
      kind: 'move',
      movedId: 9,
      reorderIds: [1, 9],
    })
  })

  it('moves a timed task with no reorder (it sorts by time)', () => {
    const moved = task(9, '2026-06-01', { due_time: '09:00' })
    const e = event([item(moved)], TRIGGERS.DROPPED_INTO_ZONE, cellItemId(moved))
    expect(dropKind(e, '2026-06-02', [moved])).toEqual({
      kind: 'move',
      movedId: 9,
      reorderIds: null,
    })
  })
})

describe('applyMove', () => {
  it('moves an untimed task to the dest day, appended after its existing untimed', () => {
    const tasks = [
      task(1, '2026-06-02', { sort_order: 0 }),
      task(2, '2026-06-02', { sort_order: 1 }),
      task(9, '2026-06-05', { sort_order: 0 }),
    ]
    const out = applyMove(tasks, 9, '2026-06-02')
    const moved = out.find((t) => t.id === 9)!
    expect(moved.due_date).toBe('2026-06-02')
    expect(moved.occurrence_date).toBe('2026-06-02')
    expect(out.filter((t) => t.occurrence_date === '2026-06-02').map((t) => t.id)).toEqual([
      1, 2, 9,
    ])
  })

  it('places a moved timed task in time order on the dest day', () => {
    const tasks = [
      task(1, '2026-06-02', { due_time: '12:00' }),
      task(2, '2026-06-02'), // untimed, sorts after timed
      task(9, '2026-06-05', { due_time: '09:00' }),
    ]
    const out = applyMove(tasks, 9, '2026-06-02')
    expect(out.filter((t) => t.occurrence_date === '2026-06-02').map((t) => t.id)).toEqual([
      9, 1, 2,
    ])
  })

  it('leaves other days untouched', () => {
    const tasks = [task(1, '2026-06-01'), task(2, '2026-06-03'), task(9, '2026-06-05')]
    const out = applyMove(tasks, 9, '2026-06-01')
    expect(out.filter((t) => t.occurrence_date === '2026-06-03').map((t) => t.id)).toEqual([2])
  })

  it('is a no-op for a recurring task', () => {
    const tasks = [task(9, '2026-06-01', { recurrence_rule: 'FREQ=DAILY' })]
    expect(applyMove(tasks, 9, '2026-06-02')).toBe(tasks)
  })

  it('is a no-op for an unknown id', () => {
    const tasks = [task(1, '2026-06-01')]
    expect(applyMove(tasks, 42, '2026-06-02')).toBe(tasks)
  })
})
