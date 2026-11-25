import { describe, expect, it } from 'vitest'
import { TRIGGERS } from 'svelte-dnd-action'
import { MON, TUE, dndDetail, on, recurring } from '../test/factories'
import type { Task } from '../types'
import { dropKind } from './drop'
import { occurrenceKey } from './predicates'
import type { CellItem } from './projection'

const item = (t: Task): CellItem => ({ id: occurrenceKey(t), task: t })
const landed = (moved: Task, items: Task[]) =>
  dndDetail(items.map(item), TRIGGERS.DROPPED_INTO_ZONE, occurrenceKey(moved))

describe('dropKind', () => {
  it('ignores a source zone (item left it — not the landing zone)', () => {
    const moved = on(MON, { id: 9 })
    const detail = dndDetail<CellItem>([], TRIGGERS.DROPPED_INTO_ANOTHER, occurrenceKey(moved))
    expect(dropKind(detail, TUE, [moved])).toEqual({ kind: 'none' })
  })

  it('reorders within the day on a same-day untimed drop (the cell owns untimed order)', () => {
    const a = on(TUE, { id: 1 })
    const moved = on(TUE, { id: 9 })
    expect(dropKind(landed(moved, [moved, a]), TUE, [a, moved])).toEqual({
      kind: 'reorder',
      ids: [9, 1],
    })
  })

  it('excludes timed pills from a same-day reorder (they sort by time)', () => {
    const timedPin = on(TUE, { id: 1, due_time: '09:00' })
    const moved = on(TUE, { id: 9 })
    expect(dropKind(landed(moved, [moved, timedPin]), TUE, [timedPin, moved])).toEqual({
      kind: 'reorder',
      ids: [9],
    })
  })

  it('ignores a same-day drop of a timed pill (it is pinned by time)', () => {
    const moved = on(TUE, { id: 9, due_time: '09:00' })
    expect(dropKind(landed(moved, [moved]), TUE, [moved])).toEqual({ kind: 'none' })
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

  it('ignores a same-day drop of a recurring instance (it is pinned to its day)', () => {
    const moved = recurring(on(TUE, { id: 9 }))
    expect(dropKind(landed(moved, [moved]), TUE, [moved])).toEqual({ kind: 'none' })
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
