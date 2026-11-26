import { describe, expect, it } from 'vitest'
import {
  FRI,
  MON,
  NEXT_MON,
  THU,
  TUE,
  WED,
  done,
  makeTask,
  on,
  recurring,
  timed,
} from '../test/factories'
import { compareSortOrder, completedLast, sortForSearch, sortForView } from './sort'

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

describe('sortForSearch', () => {
  const today = WED
  const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title)

  it('puts upcoming first, then undated, then past, then completed', () => {
    const tasks = [
      done(on(THU, { title: 'done later' })),
      on(MON, { title: 'past' }),
      makeTask({ title: 'inbox' }),
      on(THU, { title: 'upcoming' }),
    ]
    expect(titles(sortForSearch(tasks, today))).toEqual(['upcoming', 'inbox', 'past', 'done later'])
  })

  it('orders upcoming by date, timed before untimed, then time, then title', () => {
    const tasks = [
      on(NEXT_MON, { title: 'next week' }),
      on(today, { title: 'b untimed' }),
      timed('14:00', on(today, { title: 'afternoon' })),
      on(today, { title: 'A untimed' }),
      timed('09:00', on(today, { title: 'morning' })),
      on(THU, { title: 'tomorrow' }),
    ]
    expect(titles(sortForSearch(tasks, today))).toEqual([
      'morning',
      'afternoon',
      'A untimed',
      'b untimed',
      'tomorrow',
      'next week',
    ])
  })

  it('orders undated by title, case-insensitively', () => {
    const tasks = [makeTask({ title: 'beta' }), makeTask({ title: 'Alpha' })]
    expect(titles(sortForSearch(tasks, today))).toEqual(['Alpha', 'beta'])
  })

  it('orders past and completed most recent first, then by title', () => {
    const tasks = [
      done(on('2025-01-01', { title: 'done old' })),
      on(MON, { title: 'past old' }),
      done(on(FRI, { title: 'done new' })),
      on(TUE, { title: 'past b' }),
      on(TUE, { title: 'past a' }),
      done(makeTask({ title: 'done undated' })),
    ]
    expect(titles(sortForSearch(tasks, today))).toEqual([
      'past a',
      'past b',
      'past old',
      'done new',
      'done old',
      'done undated',
    ])
  })

  it('places a series that already started as due today, and a future one by its start', () => {
    const tasks = [
      on(THU, { title: 'one-off tomorrow' }),
      recurring(on('2020-01-06', { title: 'old series' })),
      recurring(on(FRI, { title: 'future series' })),
      on(today, { title: 'one-off today' }),
      on(MON, { title: 'past one-off' }),
    ]
    expect(titles(sortForSearch(tasks, today))).toEqual([
      'old series',
      'one-off today',
      'one-off tomorrow',
      'future series',
      'past one-off',
    ])
  })

  it('never sinks a series among the completed rows', () => {
    const tasks = [done(on(MON, { title: 'done' })), recurring(done(on(MON, { title: 'series' })))]
    expect(titles(sortForSearch(tasks, today))).toEqual(['series', 'done'])
  })

  it('leaves the input untouched', () => {
    const tasks = [on(MON, { title: 'past' }), on(THU, { title: 'upcoming' })]
    sortForSearch(tasks, today)
    expect(titles(tasks)).toEqual(['past', 'upcoming'])
  })
})
