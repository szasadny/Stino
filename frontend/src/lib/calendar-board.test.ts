import { describe, expect, it } from 'vitest'
import { appendedUntimedOrder, buildBoard, cellItemId } from './calendar-board'
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

describe('cellItemId', () => {
  it('is unique per (id, occurrence day) so a recurring id never collides', () => {
    const a = task(7, '2026-06-01')
    const b = task(7, '2026-06-02')
    expect(cellItemId(a)).not.toBe(cellItemId(b))
    expect(cellItemId(a)).toBe('7:2026-06-01')
  })

  it('falls back to due_date when there is no occurrence_date', () => {
    expect(cellItemId({ ...task(3, null), due_date: '2026-06-03' })).toBe('3:2026-06-03')
  })
})

describe('buildBoard', () => {
  const keys = ['2026-06-01', '2026-06-02', '2026-06-03']

  it('seeds every grid key, including empty days, as a drop target', () => {
    const board = buildBoard([task(1, '2026-06-01')], keys)
    expect(Object.keys(board)).toEqual(keys)
    expect(board['2026-06-02']).toEqual([])
    expect(board['2026-06-03']).toEqual([])
  })

  it('skips unscheduled tasks and tasks outside the grid', () => {
    const board = buildBoard([task(1, null), task(2, '2026-07-01')], keys)
    expect(board['2026-06-01']).toEqual([])
    expect(Object.values(board).flat()).toEqual([])
  })

  it('preserves per-day input order', () => {
    const board = buildBoard([task(2, '2026-06-01'), task(1, '2026-06-01')], keys)
    expect(board['2026-06-01'].map((it) => it.task.id)).toEqual([2, 1])
  })

  it('gives a recurring id landing on two days distinct item ids', () => {
    const board = buildBoard([task(7, '2026-06-01'), task(7, '2026-06-02')], keys)
    expect(board['2026-06-01'][0].id).toBe('7:2026-06-01')
    expect(board['2026-06-02'][0].id).toBe('7:2026-06-02')
  })
})

describe('appendedUntimedOrder', () => {
  it("keeps the day's existing untimed order and appends the moved task last", () => {
    const tasks = [
      task(1, '2026-06-02'), // already on the destination day
      task(2, '2026-06-02'),
      task(9, '2026-06-05'), // the moved task, still on its old day
    ]
    expect(appendedUntimedOrder(tasks, '2026-06-02', 9)).toEqual([1, 2, 9])
  })

  it('excludes timed tasks (they sort by time, not manual order)', () => {
    const tasks = [
      task(1, '2026-06-02', { due_time: '09:00' }),
      task(2, '2026-06-02'),
      task(9, '2026-06-05'),
    ]
    expect(appendedUntimedOrder(tasks, '2026-06-02', 9)).toEqual([2, 9])
  })

  it('never duplicates the moved task even if it is already on the day', () => {
    const tasks = [task(1, '2026-06-02'), task(9, '2026-06-02')]
    expect(appendedUntimedOrder(tasks, '2026-06-02', 9)).toEqual([1, 9])
  })
})
