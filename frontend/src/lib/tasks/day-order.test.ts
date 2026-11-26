import { describe, expect, it } from 'vitest'
import { FRI, TUE, makeTask, on } from '../test/factories'
import { appendedUntimedOrder, isUntimedOrder } from './day-order'

describe('isUntimedOrder', () => {
  const tasks = [
    makeTask({ id: 1, sort_order: 4 }),
    makeTask({ id: 2, sort_order: 7 }),
    makeTask({ id: 3, sort_order: 9 }),
  ]

  it('is true when the ids already follow sort_order, so a drop back in place saves nothing', () => {
    expect(isUntimedOrder(tasks, [1, 2, 3])).toBe(true)
    expect(isUntimedOrder(tasks, [2])).toBe(true)
  })

  it('is false for a real reorder, ties, or unknown ids', () => {
    expect(isUntimedOrder(tasks, [2, 1, 3])).toBe(false)
    expect(isUntimedOrder([makeTask({ id: 1 }), makeTask({ id: 2 })], [1, 2])).toBe(false)
    expect(isUntimedOrder(tasks, [1, 99])).toBe(false)
  })
})

describe('appendedUntimedOrder', () => {
  it("keeps the day's existing untimed order and appends the moved task last", () => {
    const tasks = [on(TUE, { id: 1 }), on(TUE, { id: 2 }), on(FRI, { id: 9 })]
    expect(appendedUntimedOrder(tasks, TUE, 9)).toEqual([1, 2, 9])
  })

  it('excludes timed tasks (they sort by time, not manual order)', () => {
    const tasks = [on(TUE, { id: 1, due_time: '09:00' }), on(TUE, { id: 2 }), on(FRI, { id: 9 })]
    expect(appendedUntimedOrder(tasks, TUE, 9)).toEqual([2, 9])
  })

  it('never duplicates the moved task even if it is already on the day', () => {
    const tasks = [on(TUE, { id: 1 }), on(TUE, { id: 9 })]
    expect(appendedUntimedOrder(tasks, TUE, 9)).toEqual([1, 9])
  })
})
