import { describe, expect, it } from 'vitest'
import { MON, TUE, done, makeTask, on, timed } from '../test/factories'
import { compareSortOrder, completedLast, sortForView } from './sort'

const ids = (items: { id: number }[]) => items.map((t) => t.id)

describe('completedLast', () => {
  it('sinks completed items below unfinished ones, stable within each half', () => {
    const tasks = [
      done({ id: 1 }),
      makeTask({ id: 2 }),
      done({ id: 3 }),
      timed('09:00', { id: 4 }),
      makeTask({ id: 5 }),
    ]
    expect(ids(completedLast(tasks))).toEqual([2, 4, 5, 1, 3])
  })

  it('is the identity when nothing or everything is completed', () => {
    expect(ids(completedLast([makeTask({ id: 1 }), makeTask({ id: 2 })]))).toEqual([1, 2])
    expect(ids(completedLast([done({ id: 1 }), done({ id: 2 })]))).toEqual([1, 2])
    expect(completedLast([])).toEqual([])
  })

  it('works on any item carrying a completed flag and leaves the input untouched', () => {
    const items = [
      { id: 'a', completed: true },
      { id: 'b', completed: false },
    ]
    expect(completedLast(items).map((i) => i.id)).toEqual(['b', 'a'])
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('compareSortOrder', () => {
  it('orders by sort_order, then id', () => {
    expect(compareSortOrder({ id: 2, sort_order: 0 }, { id: 1, sort_order: 1 })).toBeLessThan(0)
    expect(compareSortOrder({ id: 2, sort_order: 0 }, { id: 1, sort_order: 0 })).toBeGreaterThan(0)
  })
})

describe('sortForView', () => {
  it('orders by occurrence day, then timed-first by time, then sort_order, then id', () => {
    const tasks = [
      on(TUE, { id: 5, sort_order: 1 }),
      on(TUE, { id: 4, sort_order: 0 }),
      on(MON, { id: 3, due_time: '09:00' }),
      on(MON, { id: 2, sort_order: 5 }),
      on(MON, { id: 1, due_time: '08:00' }),
    ]
    expect(ids(sortForView(tasks))).toEqual([1, 3, 2, 4, 5])
  })

  it('breaks ties on id and returns a new array without mutating the input', () => {
    const tasks = [on(MON, { id: 9 }), on(MON, { id: 2 })]
    const snapshot = [...tasks]
    expect(ids(sortForView(tasks))).toEqual([2, 9])
    expect(tasks).toEqual(snapshot)
  })
})
