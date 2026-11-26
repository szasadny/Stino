import { describe, expect, it } from 'vitest'
import { TRIGGERS } from 'svelte-dnd-action'
import { MON, TUE, dndDetail, done, makeLabel, on, recurring, timed } from '../test/factories'
import type { Label, Task } from '../types'
import { dropKind, droppedUntimedOrder } from './drop'
import { occurrenceKey } from './predicates'
import type { CellItem } from './projection'
import { completedLast } from './sort'

const item = (t: Task): CellItem => ({ id: occurrenceKey(t), task: t })
const landed = (moved: Task, items: Task[]) =>
  dndDetail(items.map(item), TRIGGERS.DROPPED_INTO_ZONE, occurrenceKey(moved))

describe('dropKind', () => {
  it('ignores a source zone (the item left it; it is not the landing zone)', () => {
    const moved = on(MON, { id: 9 })
    const detail = dndDetail<CellItem>([], TRIGGERS.DROPPED_INTO_ANOTHER, occurrenceKey(moved))
    expect(dropKind(detail, TUE, [moved])).toEqual({ kind: 'none' })
  })

  it('moves only the dragged instance of a recurring task to another day', () => {
    const moved = recurring(on(MON, { id: 9 }))
    expect(dropKind(landed(moved, [moved]), TUE, [moved])).toEqual({
      kind: 'move-occurrence',
      taskId: 9,
      occurrenceDate: MON,
      newDate: TUE,
    })
  })

  it('ignores a drop whose moved id is not among the items', () => {
    const detail = dndDetail<CellItem>([], TRIGGERS.DROPPED_INTO_ZONE, `99:${MON}`)
    expect(dropKind(detail, TUE, [])).toEqual({ kind: 'none' })
  })

  it('moves an untimed task with the dest day order to persist', () => {
    const moved = on(MON, { id: 9 })
    const existing = on(TUE, { id: 1 })
    expect(dropKind(landed(moved, [existing, moved]), TUE, [existing, moved])).toEqual({
      kind: 'move',
      movedId: 9,
      reorderIds: [1, 9],
    })
  })

  it('moves a timed task with no reorder (it sorts by time)', () => {
    const moved = on(MON, { id: 9, due_time: '09:00' })
    expect(dropKind(landed(moved, [moved]), TUE, [moved])).toEqual({
      kind: 'move',
      movedId: 9,
      reorderIds: null,
    })
  })
})

describe('dropKind within one calendar day', () => {
  const labels: Label[] = [makeLabel({ id: 1, sort_order: 0 }), makeLabel({ id: 2, sort_order: 1 })]
  const a1 = on(TUE, { id: 10, label_id: 1, sort_order: 0 })
  const a2 = on(TUE, { id: 11, label_id: 1, sort_order: 1 })
  const b1 = on(TUE, { id: 20, label_id: 2, sort_order: 2 })
  const n1 = on(TUE, { id: 30, sort_order: 3 })
  const t1 = timed('09:00', on(TUE, { id: 40 }))
  const t2 = timed('10:00', on(TUE, { id: 41 }))
  const plan = (moved: Task, rows: Task[], labelOrder?: Label[]) =>
    dropKind(landed(moved, rows), TUE, rows, labelOrder)

  it("saves a reorder within one label as the day's untimed ids in dropped order", () => {
    expect(plan(a2, [a2, a1, b1, n1], labels)).toEqual({ kind: 'reorder', ids: [11, 10, 20, 30] })
  })

  it('saves nothing for a drop between the tasks of another label', () => {
    expect(plan(a1, [a2, b1, a1, n1], labels)).toEqual({ kind: 'none' })
  })

  it('saves nothing for a task without label dropped among labelled ones', () => {
    expect(plan(n1, [n1, a1, a2, b1], labels)).toEqual({ kind: 'none' })
  })

  it('takes any untimed order in List sorting', () => {
    expect(plan(n1, [n1, a1, a2, b1])).toEqual({ kind: 'reorder', ids: [30, 10, 11, 20] })
  })

  it('saves nothing for a timed task dropped out of time order', () => {
    expect(plan(t2, [t2, t1, a1])).toEqual({ kind: 'none' })
  })

  it('saves nothing for an untimed task dropped above a timed one', () => {
    expect(plan(a1, [a1, t1])).toEqual({ kind: 'none' })
  })

  it('leaves the timed tasks out of a valid reorder', () => {
    expect(plan(a2, [t1, a2, a1])).toEqual({ kind: 'reorder', ids: [11, 10] })
  })

  it('saves nothing for a completed task dropped above an open one', () => {
    const finished = done(on(TUE, { id: 50, sort_order: 4 }))
    expect(plan(finished, [finished, a1])).toEqual({ kind: 'none' })
  })

  it('reorders an untimed recurring row within its day', () => {
    const series = recurring(on(TUE, { id: 60, sort_order: 5 }))
    expect(plan(series, [series, a1])).toEqual({ kind: 'reorder', ids: [60, 10] })
  })

  it('takes a drop back in place as the current order', () => {
    expect(plan(a1, [a1, a2, b1, n1], labels)).toEqual({ kind: 'reorder', ids: [10, 11, 20, 30] })
  })
})

describe('droppedUntimedOrder (a day view group list)', () => {
  const a = on(TUE, { id: 1, sort_order: 0 })
  const b = on(TUE, { id: 2, sort_order: 1 })
  const finished = done(on(TUE, { id: 3, sort_order: 2 }))
  const other = on(TUE, { id: 4, sort_order: 3 })

  it("saves an in-group reorder as the day's untimed ids in reading order across groups", () => {
    const day = [timed('09:00', on(TUE, { id: 9 })), b, a, finished, other]
    expect(droppedUntimedOrder([b, a, finished], completedLast, day)).toEqual([2, 1, 3, 4])
  })

  it('saves nothing when an open task lands below a completed one', () => {
    expect(droppedUntimedOrder([a, finished, b], completedLast)).toBeNull()
  })
})
