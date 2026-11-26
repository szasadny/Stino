import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { SEARCH_DEBOUNCE_MS } from '../../lib/constants'
import { ApiError } from '../../lib/errors'
import { LOAD_LABELS_FAILED, NETWORK_ERROR_MESSAGE, SEARCH_FAILED } from '../../lib/messages'
import {
  MON,
  THU,
  WED,
  deferred,
  makeLabel,
  makeTask,
  on,
  recurring,
} from '../../lib/test/factories'
import { setToday } from '../../lib/today.svelte'
import type { Task } from '../../lib/types'
import { createSearch, type Search } from './search.svelte'

vi.mock('../../lib/api', () => ({
  api: {
    search: vi.fn(),
    labels: { list: vi.fn() },
    tasks: { update: vi.fn(), complete: vi.fn(), uncomplete: vi.fn() },
  },
}))

const titles = (tasks: Task[]) => tasks.map((t) => t.title)

describe('createSearch', () => {
  let search: Search
  let cleanup: () => void

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(api.labels.list).mockResolvedValue([makeLabel({ id: 1, name: 'Home' })])
    cleanup = $effect.root(() => {
      search = createSearch()
    })
    flushSync()
    await vi.advanceTimersByTimeAsync(0)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  async function type(value: string) {
    search.input(value)
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
  }

  it('loads the labels for the result tints', () => {
    expect(search.core.labels.map((l) => l.name)).toEqual(['Home'])
  })

  it('searches once the typing settles', async () => {
    vi.mocked(api.search).mockResolvedValue([makeTask({ title: 'Gym' })])
    search.input('g')
    search.input('gy')
    expect(search.loading).toBe(true)
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    expect(api.search).toHaveBeenCalledOnce()
    expect(api.search).toHaveBeenCalledWith('gy')
    expect([search.loading, search.searched, titles(search.results)]).toEqual([
      false,
      true,
      ['Gym'],
    ])
  })

  it('drops a slower response to an older query', async () => {
    const old = deferred<Task[]>()
    const newer = deferred<Task[]>()
    vi.mocked(api.search).mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise)
    await type('a')
    await type('ab')
    old.resolve([makeTask({ id: 1, title: 'Older' })])
    await vi.advanceTimersByTimeAsync(0)
    expect([search.loading, titles(search.results)]).toEqual([true, []])
    newer.resolve([makeTask({ id: 2, title: 'Newer' })])
    await vi.advanceTimersByTimeAsync(0)
    expect([search.loading, titles(search.results)]).toEqual([false, ['Newer']])
  })

  it('keeps the previous results on screen, marked stale, while a newer query runs', async () => {
    vi.mocked(api.search).mockResolvedValueOnce([makeTask({ id: 1, title: 'Gym' })])
    await type('g')
    expect(search.stale).toBe(false)

    const next = deferred<Task[]>()
    vi.mocked(api.search).mockReturnValueOnce(next.promise)
    search.input('gy')
    expect([search.loading, search.stale, titles(search.results)]).toEqual([true, true, ['Gym']])
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    expect(search.stale).toBe(true)

    next.resolve([makeTask({ id: 2, title: 'Gym bag' })])
    await vi.advanceTimersByTimeAsync(0)
    expect([search.loading, search.stale, titles(search.results)]).toEqual([
      false,
      false,
      ['Gym bag'],
    ])
  })

  it('is loading but not stale while the first query has nothing to show yet', () => {
    search.input('g')
    expect([search.loading, search.stale]).toEqual([true, false])
  })

  it('clears the results for an empty query and reports a failed search', async () => {
    vi.mocked(api.search).mockResolvedValue([makeTask()])
    await type('x')
    await type('  ')
    expect([search.results, search.searched, search.loading]).toEqual([[], false, false])

    vi.mocked(api.search).mockRejectedValue(new ApiError('server'))
    await type('y')
    expect(search.error).toBe(SEARCH_FAILED)

    vi.mocked(api.search).mockRejectedValue(new ApiError('network'))
    await type('yz')
    expect(search.error).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('toggles a result through the core lock', async () => {
    const task = on(MON, { id: 3 })
    vi.mocked(api.search).mockResolvedValue([task])
    await type('t')
    vi.mocked(api.tasks.complete).mockResolvedValue({ ...task, completed: true })
    expect(await search.toggle(task)).toBe(true)
    expect(search.results[0]?.completed).toBe(true)
  })

  it('lands two quick ticks on the results, one request after the other', async () => {
    const first = on(MON, { id: 3 })
    const second = on(MON, { id: 4 })
    vi.mocked(api.search).mockResolvedValue([first, second])
    await type('t')
    const reply = deferred<Task>()
    vi.mocked(api.tasks.complete)
      .mockReturnValueOnce(reply.promise)
      .mockResolvedValueOnce({ ...second, completed: true })
    const ticks = [search.toggle(first), search.toggle(second)]
    expect(search.results.map((t) => t.completed)).toEqual([true, true])
    expect(api.tasks.complete).toHaveBeenCalledOnce()
    reply.resolve({ ...first, completed: true })
    expect(await Promise.all(ticks)).toEqual([true, true])
    expect(api.tasks.complete).toHaveBeenCalledTimes(2)
    expect(search.results.map((t) => t.completed)).toEqual([true, true])
  })

  it('undoes a failed tick on the results kept on screen while a refined query runs', async () => {
    const task = on(MON, { id: 3 })
    vi.mocked(api.search).mockResolvedValueOnce([task])
    await type('t')
    const failing = deferred<Task>()
    vi.mocked(api.tasks.complete).mockReturnValue(failing.promise)
    vi.mocked(api.search).mockReturnValueOnce(deferred<Task[]>().promise)
    const tick = search.toggle(task)
    await type('ta')
    expect([search.stale, search.results[0]?.completed]).toEqual([true, true])
    failing.reject(new ApiError('server'))
    expect(await tick).toBe(false)
    expect(search.results[0]?.completed).toBe(false)
  })

  it('holds a refined query while a tick is in flight, then searches once', async () => {
    const task = on(MON, { id: 3 })
    vi.mocked(api.search).mockResolvedValue([task])
    await type('t')
    const saving = deferred<Task>()
    vi.mocked(api.tasks.complete).mockReturnValue(saving.promise)
    const tick = search.toggle(task)
    await type('ta')
    expect([search.results[0]?.completed, vi.mocked(api.search).mock.calls.length]).toEqual([
      true,
      1,
    ])
    vi.mocked(api.search).mockResolvedValue([{ ...task, completed: true }])
    saving.resolve({ ...task, completed: true })
    expect(await tick).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect([search.results[0]?.completed, vi.mocked(api.search).mock.calls.length]).toEqual([
      true,
      2,
    ])
  })

  it('searches again when a tick settles while the search is in flight', async () => {
    const task = on(MON, { id: 3 })
    vi.mocked(api.search).mockResolvedValue([task])
    await type('t')
    const stale = deferred<Task[]>()
    vi.mocked(api.search)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([{ ...task, completed: true }])
    await type('ta')
    vi.mocked(api.tasks.complete).mockResolvedValue({ ...task, completed: true })
    expect(await search.toggle(task)).toBe(true)
    stale.resolve([task])
    await vi.advanceTimersByTimeAsync(0)
    expect([search.results[0]?.completed, vi.mocked(api.search).mock.calls.length]).toEqual([
      true,
      3,
    ])
  })

  it('shows upcoming results first and keeps a ticked row in place', async () => {
    setToday(WED)
    const past = on(MON, { id: 1, title: 'Past' })
    const upcoming = on(THU, { id: 2, title: 'Upcoming' })
    vi.mocked(api.search).mockResolvedValue([past, upcoming])
    await type('p')
    expect(titles(search.results)).toEqual(['Upcoming', 'Past'])
    vi.mocked(api.tasks.complete).mockResolvedValue({ ...upcoming, completed: true })
    await search.toggle(upcoming)
    expect(titles(search.results)).toEqual(['Upcoming', 'Past'])
    expect(search.results[0]?.completed).toBe(true)
  })

  it('edits a recurring row as its series, without a single-occurrence delete', () => {
    search.edit(recurring({ id: 4, due_date: MON, occurrence_date: MON }))
    expect(search.composer.onDelete).toBeDefined()
    expect(search.composer.onDeleteOccurrence).toBeUndefined()
    expect(search.composer.editingSeries).toBe(true)
  })

  it('re-runs the search after a save and returns to the results', async () => {
    vi.mocked(api.search).mockResolvedValue([on(MON, { id: 5, title: 'Old' })])
    await type('o')
    vi.mocked(api.tasks.update).mockResolvedValue(on(MON, { id: 5, title: 'New' }))
    vi.mocked(api.search).mockResolvedValue([on(MON, { id: 5, title: 'New' })])
    search.edit(on(MON, { id: 5, title: 'Old' }))
    await search.composer.submit({ title: 'New' })
    expect(api.search).toHaveBeenLastCalledWith('o')
    expect([search.composer.open, titles(search.results)]).toEqual([false, ['New']])
  })
})

describe('createSearch label load', () => {
  it('surfaces a failed label load instead of swallowing it', async () => {
    vi.mocked(api.labels.list).mockRejectedValue(new ApiError('server'))
    let search: Search | undefined
    const cleanup = $effect.root(() => {
      search = createSearch()
    })
    flushSync()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(search?.error).toBe(LOAD_LABELS_FAILED)
    cleanup()
  })
})
