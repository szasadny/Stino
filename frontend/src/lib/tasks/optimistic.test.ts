import { describe, expect, it } from 'vitest'
import {
  FRI,
  MON,
  NEXT_MON,
  RRULE,
  TUE,
  WED,
  makeLabel,
  makeTask,
  on,
  recurring,
  timed,
} from '../test/factories'
import type { Task } from '../types'
import {
  applyLabelOrder,
  applyMove,
  applyUntimedOrder,
  replaceOccurrence,
  restoreOccurrence,
  withoutOccurrence,
  withoutTasks,
} from './optimistic'

const ids = (items: { id: number }[]) => items.map((t) => t.id)
const onDay = (tasks: Task[], day: string) => ids(tasks.filter((t) => t.occurrence_date === day))

describe('applyUntimedOrder', () => {
  it('keeps timed tasks leading in their existing order and reorders untimed to ids', () => {
    const tasks = [
      timed('09:00', { id: 1 }),
      makeTask({ id: 2 }),
      makeTask({ id: 3 }),
      makeTask({ id: 4 }),
    ]
    expect(ids(applyUntimedOrder(tasks, [4, 2, 3]))).toEqual([1, 4, 2, 3])
  })

  it('patches sort_order of untimed tasks to their new index', () => {
    const tasks = [makeTask({ id: 2 }), makeTask({ id: 3 }), makeTask({ id: 4 })]
    expect(applyUntimedOrder(tasks, [4, 2, 3]).map((t) => [t.id, t.sort_order])).toEqual([
      [4, 0],
      [2, 1],
      [3, 2],
    ])
  })

  it('ignores unknown ids and never reorders a timed task into the untimed run', () => {
    const tasks = [timed('09:00', { id: 1 }), makeTask({ id: 2 })]
    expect(ids(applyUntimedOrder(tasks, [99, 1, 2]))).toEqual([1, 2])
  })

  it('preserves untimed tasks on OTHER days when reordering one day of a range', () => {
    const tasks = [
      on(TUE, { id: 1, sort_order: 0 }),
      on(TUE, { id: 2, sort_order: 1 }),
      on(FRI, { id: 9, sort_order: 0 }),
    ]
    expect(ids(applyUntimedOrder(tasks, [2, 1]))).toEqual([2, 1, 9])
  })
})

describe('applyMove', () => {
  it('moves an untimed task to the dest day, appended after its existing untimed', () => {
    const tasks = [
      on(TUE, { id: 1, sort_order: 0 }),
      on(TUE, { id: 2, sort_order: 1 }),
      on(FRI, { id: 9, sort_order: 0 }),
    ]
    const out = applyMove(tasks, 9, TUE)
    expect(out.find((t) => t.id === 9)).toMatchObject({ due_date: TUE, occurrence_date: TUE })
    expect(onDay(out, TUE)).toEqual([1, 2, 9])
  })

  it('places a moved timed task in time order on the dest day', () => {
    const tasks = [
      on(TUE, { id: 1, due_time: '12:00' }),
      on(TUE, { id: 2 }),
      on(FRI, { id: 9, due_time: '09:00' }),
    ]
    expect(onDay(applyMove(tasks, 9, TUE), TUE)).toEqual([9, 1, 2])
  })

  it('leaves other days untouched', () => {
    const tasks = [on(MON, { id: 1 }), on(WED, { id: 2 }), on(FRI, { id: 9 })]
    expect(onDay(applyMove(tasks, 9, MON), WED)).toEqual([2])
  })

  it('is a no-op for a recurring task', () => {
    const tasks = [recurring(on(MON, { id: 9 }))]
    expect(applyMove(tasks, 9, TUE)).toBe(tasks)
  })

  it('is a no-op for an unknown id', () => {
    const tasks = [on(MON, { id: 1 })]
    expect(applyMove(tasks, 42, TUE)).toBe(tasks)
  })
})

describe('applyLabelOrder', () => {
  const all = [
    makeLabel({ id: 1, sort_order: 0 }),
    makeLabel({ id: 2, sort_order: 1 }),
    makeLabel({ id: 3, sort_order: 2 }),
  ]

  it('reorders the labels and renumbers sort_order to the new positions', () => {
    const out = applyLabelOrder(all, [3, 1, 2])
    expect(ids(out)).toEqual([3, 1, 2])
    expect(out.map((l) => l.sort_order)).toEqual([0, 1, 2])
  })

  it('keeps labels missing from ids at the end', () => {
    expect(ids(applyLabelOrder(all, [2]))).toEqual([2, 1, 3])
  })
})

describe('replaceOccurrence', () => {
  it('replaces only the row matching (id, occurrence_date)', () => {
    const list = [on(MON, { id: 1 }), on(TUE, { id: 1 }), on(null, { id: 2 })]
    const out = replaceOccurrence(list, on(TUE, { id: 1, completed: true }))
    expect(out.map((t) => t.completed)).toEqual([false, true, false])
  })

  it('matches a null occurrence (an Inbox task)', () => {
    const out = replaceOccurrence([on(null, { id: 2 })], on(null, { id: 2, completed: true }))
    expect(out.map((t) => t.completed)).toEqual([true])
  })

  it('leaves the list unchanged when nothing matches', () => {
    const list = [on(MON, { id: 1 })]
    expect(replaceOccurrence(list, on(MON, { id: 9, completed: true }))).toEqual(list)
  })
})

describe('withoutTasks', () => {
  it('drops every occurrence of the given ids and keeps the rest in order', () => {
    const list = [
      on(MON, { id: 1 }),
      on(NEXT_MON, { id: 2 }),
      on(NEXT_MON, { id: 1 }),
      on(TUE, { id: 3 }),
    ]
    expect(withoutTasks(list, [1, 3]).map((t) => [t.id, t.occurrence_date])).toEqual([
      [2, NEXT_MON],
    ])
  })
})

describe('withoutOccurrence', () => {
  it('drops only the matching (id, occurrence_date) row', () => {
    const list = [on(MON, { id: 1 }), on(NEXT_MON, { id: 1 }), on(NEXT_MON, { id: 2 })]
    expect(withoutOccurrence(list, 1, NEXT_MON).map((t) => [t.id, t.occurrence_date])).toEqual([
      [1, MON],
      [2, NEXT_MON],
    ])
  })
})

describe('restoreOccurrence', () => {
  const inbox = (id: number, completed = false) => on(null, { id, completed })

  it('reinserts at the original index', () => {
    expect(ids(restoreOccurrence([inbox(1), inbox(3)], inbox(2), 1))).toEqual([1, 2, 3])
  })

  it('clamps an index outside the list to its nearest end', () => {
    expect(ids(restoreOccurrence([inbox(1)], inbox(2), 5))).toEqual([1, 2])
    expect(ids(restoreOccurrence([inbox(1)], inbox(2), -1))).toEqual([2, 1])
  })

  it('replaces a row that is already present instead of duplicating it', () => {
    const out = restoreOccurrence([inbox(1), inbox(2)], inbox(2, true), 0)
    expect(ids(out)).toEqual([1, 2])
    expect(out.map((t) => t.completed)).toEqual([false, true])
  })
})

describe('applyMove with a recurring series on the dest day', () => {
  it('mirrors the server reorder, which renumbers the series as a whole', () => {
    const series = recurring({ id: 5, sort_order: 3 }, RRULE.daily)
    const tasks = [
      { ...series, occurrence_date: TUE },
      { ...series, occurrence_date: WED },
      on(FRI, { id: 9 }),
    ]
    const out = applyMove(tasks, 9, TUE)
    expect(onDay(out, TUE)).toEqual([5, 9])
    expect(out.filter((t) => t.id === 5).map((t) => t.sort_order)).toEqual([0, 0])
  })
})
