import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../errors'
import { LOAD_FAILED, SAVE_ORDER_FAILED, UPDATE_TASK_FAILED } from '../messages'
import { MON, TUE, deferred, done, makeLabel, makeTask, on, recurring } from '../test/factories'
import type { Task } from '../types'
import { createComposer } from './composer.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

vi.mock('../api', () => ({
  api: {
    labels: { list: vi.fn(), create: vi.fn() },
    tasks: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      complete: vi.fn(),
      uncomplete: vi.fn(),
      reorder: vi.fn(),
    },
  },
}))

// Missed recurring occurrences are hidden, so these stay ahead of the real today.
const [FUTURE_MON, FUTURE_TUE, FUTURE_WED] = ['2099-06-01', '2099-06-02', '2099-06-03']

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createTaskCore', () => {
  let core: TaskCore
  let fetchTasks: ReturnType<typeof vi.fn<() => Promise<Task[]>>>
  let cleanup: () => void
  let loadingSeen: boolean[]

  beforeEach(() => {
    vi.mocked(api.labels.list).mockResolvedValue([makeLabel({ id: 1, name: 'Home' })])
    fetchTasks = vi.fn<() => Promise<Task[]>>().mockResolvedValue([on(MON, { id: 1 })])
    loadingSeen = []
    cleanup = $effect.root(() => {
      core = createTaskCore()
      core.bindLoad(fetchTasks, LOAD_FAILED)
      $effect(() => {
        loadingSeen.push(core.loading)
      })
    })
    flushSync()
  })

  afterEach(() => cleanup())

  it('shows the loading state for the first load only', async () => {
    await settle()
    flushSync()
    expect(loadingSeen).toEqual([true, false])
    expect(core.tasks.map((t) => t.id)).toEqual([1])
    expect(core.labels.map((l) => l.name)).toEqual(['Home'])
  })

  it('reloads after a save without flipping the loading state', async () => {
    await settle()
    flushSync()
    loadingSeen.length = 0
    fetchTasks.mockResolvedValue([on(MON, { id: 1 }), on(MON, { id: 2 })])
    vi.mocked(api.tasks.create).mockResolvedValue(on(MON, { id: 2 }))
    const composer = createComposer(core)
    composer.create({ date: MON })
    await composer.submit({ title: 'New', due_date: MON })
    flushSync()
    expect(loadingSeen).toEqual([])
    expect(core.loading).toBe(false)
    expect(core.tasks.map((t) => t.id)).toEqual([1, 2])
    expect(composer.open).toBe(false)
  })

  it('finds an existing label by name without a request', async () => {
    await settle()
    expect((await core.ensureLabel(' home '))?.id).toBe(1)
    expect(api.labels.create).not.toHaveBeenCalled()
  })

  it('creates a missing label even while a write holds the lock, and reports a failure', async () => {
    await settle()
    vi.mocked(api.labels.create).mockResolvedValueOnce(makeLabel({ id: 9, name: 'Gym' }))
    let release = () => {}
    const busy = core.run(() => new Promise<void>((resolve) => (release = resolve)), 'x')
    expect((await core.ensureLabel('Gym'))?.id).toBe(9)
    release()
    await busy
    expect(core.labels.map((l) => l.id)).toEqual([1, 9])

    vi.mocked(api.labels.create).mockRejectedValueOnce(
      new ApiError('rejected', 'a label with that name already exists'),
    )
    expect(await core.ensureLabel('Run')).toBeNull()
    expect(core.error).toBe('Couldn’t create the label: a label with that name already exists.')
  })

  it('keeps a label created while a task write was failing', async () => {
    await settle()
    const saving = deferred()
    vi.mocked(api.tasks.remove).mockReturnValueOnce(saving.promise)
    vi.mocked(api.labels.create).mockResolvedValueOnce(makeLabel({ id: 9, name: 'Gym' }))
    const removed = core.remove(1)
    await core.ensureLabel('Gym')
    saving.reject(new ApiError('network'))
    expect(await removed).toBe(false)
    expect(core.tasks.map((t) => t.id)).toEqual([1])
    expect(core.labels.map((l) => l.name)).toEqual(['Home', 'Gym'])
  })

  it('inserts, patches and drops rows without a reload', async () => {
    await settle()
    core.insert(makeTask({ id: 5 }))
    core.patch({ ...on(MON, { id: 1 }), title: 'Renamed' })
    core.dropIds([5])
    expect(core.tasks.map((t) => [t.id, t.title])).toEqual([[1, 'Renamed']])
    expect(fetchTasks).toHaveBeenCalledOnce()
  })
})

describe('createTaskCore ticks', () => {
  const a = on(MON, { id: 1, sort_order: 0 })
  const b = on(MON, { id: 2, sort_order: 1 })
  let core: TaskCore
  let fetchTasks: ReturnType<typeof vi.fn<() => Promise<Task[]>>>
  let cleanup: () => void
  let sent: { call: string; reply: ReturnType<typeof deferred<Task>> }[]

  const request = (call: string) => {
    const reply = deferred<Task>()
    sent.push({ call, reply })
    return reply.promise
  }
  const calls = () => sent.map((s) => s.call)
  const reply = (index: number) => sent[index]?.reply ?? deferred<Task>()
  const doneIds = () => core.tasks.filter((t) => t.completed).map((t) => t.id)

  beforeEach(async () => {
    vi.clearAllMocks()
    sent = []
    vi.mocked(api.labels.list).mockResolvedValue([])
    vi.mocked(api.tasks.complete).mockImplementation((id, date) =>
      request(`complete ${id} ${date}`),
    )
    vi.mocked(api.tasks.uncomplete).mockImplementation((id, date) =>
      request(`uncomplete ${id} ${date}`),
    )
    fetchTasks = vi.fn<() => Promise<Task[]>>().mockResolvedValue([a, b])
    cleanup = $effect.root(() => {
      core = createTaskCore()
      core.bindLoad(fetchTasks, LOAD_FAILED)
    })
    flushSync()
    await settle()
  })

  afterEach(() => cleanup())

  it('shows a tick at once while an earlier tick is in flight, then sends it next', async () => {
    const first = core.toggle(a)
    const second = core.toggle(b)
    expect(doneIds()).toEqual([1, 2])
    expect(calls()).toEqual([`complete 1 ${MON}`])
    reply(0).resolve(done(a))
    await settle()
    expect(calls()).toEqual([`complete 1 ${MON}`, `complete 2 ${MON}`])
    expect(core.pending).toBe(true)
    reply(1).resolve(done(b))
    expect([await first, await second]).toEqual([true, true])
    expect([doneIds(), core.pending]).toEqual([[1, 2], false])
  })

  it('reverts only the failed tick and keeps its error after a later tick lands', async () => {
    const first = core.toggle(a)
    const second = core.toggle(b)
    reply(0).reject(new ApiError('server'))
    await settle()
    reply(1).resolve(done(b))
    expect([await first, await second]).toEqual([false, true])
    expect(doneIds()).toEqual([2])
    expect(core.error).toBe(UPDATE_TASK_FAILED)
  })

  it('reverts each failed tick to its own original state', async () => {
    fetchTasks.mockResolvedValue([a, done(b)])
    await core.reload()
    void core.toggle(a)
    const last = core.toggle(done(b))
    reply(0).reject(new ApiError('server'))
    await settle()
    reply(1).reject(new ApiError('server'))
    await last
    expect(doneIds()).toEqual([2])
  })

  it('sends tick then untick in order without flipping back in between', async () => {
    void core.toggle(a)
    const untick = core.toggle(done(a))
    expect(doneIds()).toEqual([])
    reply(0).resolve(done(a))
    await settle()
    expect(doneIds()).toEqual([])
    expect(calls()).toEqual([`complete 1 ${MON}`, `uncomplete 1 ${MON}`])
    reply(1).resolve(a)
    expect(await untick).toBe(true)
    expect([doneIds(), core.pending]).toEqual([[], false])
  })

  it('keys a recurring tick by its occurrence', async () => {
    const series = recurring({ id: 3, due_date: FUTURE_MON })
    const tue = { ...series, occurrence_date: FUTURE_TUE }
    const wed = { ...series, occurrence_date: FUTURE_WED }
    fetchTasks.mockResolvedValue([tue, wed])
    await core.reload()
    void core.toggle(tue)
    const second = core.toggle(wed)
    reply(0).reject(new ApiError('server'))
    await settle()
    reply(1).resolve(done(wed))
    await second
    expect(core.tasks.map((t) => t.completed)).toEqual([false, true])
  })

  it('restores a failed tick, then lands the reload that waited for it', async () => {
    void core.toggle(a)
    const second = core.toggle(b)
    reply(0).resolve(done(a))
    await settle()
    fetchTasks.mockResolvedValue([done(a), { ...b, title: 'Server' }])
    const reload = core.reload()
    reply(1).reject(new ApiError('server'))
    expect(await second).toBe(false)
    expect(doneIds()).toEqual([1])
    await reload
    expect(fetchTasks).toHaveBeenCalledTimes(2)
    expect(core.tasks.map((t) => [t.title, t.completed])).toEqual([
      ['T1', true],
      ['Server', false],
    ])
  })

  it('queues a tick behind a reorder in flight instead of dropping it', async () => {
    const saving = deferred()
    vi.mocked(api.tasks.reorder).mockReturnValue(saving.promise)
    const reorder = core.reorder([2, 1])
    const tick = core.toggle(a)
    expect(doneIds()).toEqual([1])
    expect(calls()).toEqual([])
    saving.resolve()
    expect(await reorder).toBe(true)
    await settle()
    reply(0).resolve(done(a))
    expect(await tick).toBe(true)
    expect([doneIds(), core.pending]).toEqual([[1], false])
  })

  it('keeps a queued tick shown when the reorder ahead of it fails, then persists it', async () => {
    const saving = deferred()
    vi.mocked(api.tasks.reorder).mockReturnValue(saving.promise)
    const reorder = core.reorder([2, 1])
    const tick = core.toggle(a)
    saving.reject(new ApiError('server'))
    expect(await reorder).toBe(false)
    expect([core.tasks.map((t) => t.id), doneIds()]).toEqual([[1, 2], [1]])
    await settle()
    expect(calls()).toEqual([`complete 1 ${MON}`])
    reply(0).resolve(done(a))
    expect(await tick).toBe(true)
    expect(doneIds()).toEqual([1])
  })

  it('holds a reload while ticks are queued, then lands the saved rows', async () => {
    void core.toggle(a)
    const second = core.toggle(b)
    fetchTasks.mockResolvedValue([done(a), { ...done(b), title: 'Server' }])
    const reload = core.reload()
    await settle()
    expect([fetchTasks.mock.calls.length, doneIds()]).toEqual([1, [1, 2]])
    reply(0).resolve(done(a))
    await settle()
    reply(1).resolve(done(b))
    expect(await second).toBe(true)
    await reload
    expect(core.tasks.map((t) => [t.title, t.completed])).toEqual([
      ['T1', true],
      ['Server', true],
    ])
  })

  it('still drops a form write while a tick is in flight', async () => {
    const tick = core.toggle(a)
    const write = vi.fn(() => Promise.resolve())
    expect(await core.run(write, 'x')).toBe(false)
    expect(await core.save(write, vi.fn(), 'x')).toBe(false)
    expect(write).not.toHaveBeenCalled()
    reply(0).resolve(done(a))
    expect(await tick).toBe(true)
  })
})

describe('createTaskCore loads that overlap a write', () => {
  const a = on(MON, { id: 1, sort_order: 0 })
  const b = on(MON, { id: 2, sort_order: 1 })
  const c = on(MON, { id: 3, sort_order: 2 })
  let core: TaskCore
  let cleanup: () => void
  let fetches: ReturnType<typeof deferred<Task[]>>[]

  const fetchTasks = () => {
    const reply = deferred<Task[]>()
    fetches.push(reply)
    return reply.promise
  }
  const land = async (index: number, tasks: Task[]) => {
    fetches[index]?.resolve(tasks)
    await settle()
  }
  const order = () => [...core.tasks].sort((x, y) => x.sort_order - y.sort_order).map((t) => t.id)
  const doneIds = () => core.tasks.filter((t) => t.completed).map((t) => t.id)
  const titles = () => core.tasks.map((t) => t.title)

  beforeEach(async () => {
    vi.clearAllMocks()
    fetches = []
    vi.mocked(api.labels.list).mockResolvedValue([])
    cleanup = $effect.root(() => {
      core = createTaskCore()
      core.bindLoad(fetchTasks, LOAD_FAILED)
    })
    flushSync()
    await land(0, [a, b, c])
  })

  afterEach(() => cleanup())

  it('keeps a tick that settled while an older reload was in flight', async () => {
    vi.mocked(api.tasks.complete).mockResolvedValue(done(a))
    const reload = core.reload()
    expect(await core.toggle(a)).toBe(true)
    await land(1, [a, b, c])
    expect([doneIds(), fetches.length]).toEqual([[1], 3])
    await land(2, [done(a), b, c])
    await reload
    expect([doneIds(), fetches.length]).toEqual([[1], 3])
  })

  it('keeps a reorder that settled while an older reload was in flight', async () => {
    vi.mocked(api.tasks.reorder).mockResolvedValue(undefined)
    const reload = core.reload()
    expect(await core.reorder([3, 2, 1])).toBe(true)
    await land(1, [a, b, c])
    expect([order(), fetches.length]).toEqual([[3, 2, 1], 3])
    await land(2, [{ ...c, sort_order: 0 }, b, { ...a, sort_order: 2 }])
    await reload
    expect(order()).toEqual([3, 2, 1])
  })

  it('keeps a move that settled while an older reload was in flight', async () => {
    vi.mocked(api.tasks.update).mockResolvedValue(on(TUE, { id: 1 }))
    const reload = core.reload()
    expect(await core.moveToDay(1, TUE, null)).toBe(true)
    await land(1, [a, b, c])
    expect(core.tasks.find((t) => t.id === 1)?.due_date).toBe(TUE)
    await land(2, [on(TUE, { id: 1 }), b, c])
    await reload
    expect([core.tasks.find((t) => t.id === 1)?.due_date, fetches.length]).toEqual([TUE, 3])
  })

  it('commits nothing while a write is in flight and refetches once it settles', async () => {
    const saving = deferred()
    vi.mocked(api.tasks.reorder).mockReturnValue(saving.promise)
    const reload = core.reload()
    const reorder = core.reorder([3, 2, 1])
    await land(1, [{ ...a, title: 'Stale' }, b, c])
    expect([titles(), order(), fetches.length]).toEqual([['T3', 'T2', 'T1'], [3, 2, 1], 2])
    saving.resolve()
    expect(await reorder).toBe(true)
    await settle()
    expect(fetches.length).toBe(3)
    await land(2, [{ ...c, sort_order: 0 }, b, { ...a, sort_order: 2, title: 'Server' }])
    await reload
    expect(titles()).toEqual(['T3', 'T2', 'Server'])
  })

  it('refetches after a write that started and settled during the fetch', async () => {
    vi.mocked(api.tasks.remove).mockResolvedValue(undefined)
    const reload = core.reload()
    expect(await core.remove(2)).toBe(true)
    await land(1, [a, b, c])
    expect([titles(), fetches.length]).toEqual([['T1', 'T3'], 3])
    await land(2, [a, c])
    await reload
    expect(titles()).toEqual(['T1', 'T3'])
  })

  it('fetches once for a save followed by its reload', async () => {
    const saved = core.save(() => Promise.resolve(), core.reload, 'x')
    await settle()
    expect([fetches.length, core.pending]).toEqual([2, true])
    await land(1, [a, b, { ...c, title: 'Saved' }])
    expect(await saved).toBe(true)
    expect([titles(), fetches.length, core.pending]).toEqual([['T1', 'T2', 'Saved'], 2, false])
  })

  it('persists a tick queued behind a save while its reload runs, then refetches', async () => {
    vi.mocked(api.tasks.complete).mockResolvedValue(done(a))
    const saved = core.save(() => Promise.resolve(), core.reload, 'x')
    await settle()
    expect(await core.toggle(a)).toBe(true)
    await land(1, [a, b, c])
    expect([doneIds(), fetches.length]).toEqual([[1], 3])
    await land(2, [done(a), b, c])
    expect(await saved).toBe(true)
    expect(doneIds()).toEqual([1])
  })

  it('keeps the revert of a failed write and refetches the load it overlapped', async () => {
    const saving = deferred()
    vi.mocked(api.tasks.reorder).mockReturnValue(saving.promise)
    const reorder = core.reorder([3, 2, 1])
    const reload = core.reload()
    saving.reject(new ApiError('server'))
    expect(await reorder).toBe(false)
    expect(order()).toEqual([1, 2, 3])
    await settle()
    expect(fetches.length).toBe(2)
    await land(1, [a, b, { ...c, title: 'Server' }])
    await reload
    expect([order(), titles(), core.error]).toEqual([
      [1, 2, 3],
      ['T1', 'T2', 'Server'],
      SAVE_ORDER_FAILED,
    ])
  })

  it('lands the server row after a move whose order write fails', async () => {
    vi.mocked(api.tasks.update).mockResolvedValue(on(TUE, { id: 1 }))
    vi.mocked(api.tasks.reorder).mockRejectedValue(new ApiError('server'))
    expect(await core.moveToDay(1, TUE, [1])).toBe(false)
    expect(fetches.length).toBe(2)
    await land(1, [on(TUE, { id: 1 }), b, c])
    expect(core.tasks.find((t) => t.id === 1)?.due_date).toBe(TUE)
  })

  it('commits only the newest of two loads that overlap each other and a write', async () => {
    const saving = deferred<Task>()
    vi.mocked(api.tasks.complete).mockReturnValue(saving.promise)
    const older = core.reload()
    const tick = core.toggle(a)
    const newer = core.reload()
    saving.resolve(done(a))
    expect(await tick).toBe(true)
    await settle()
    expect(fetches.length).toBe(3)
    await land(2, [done(a), b, { ...c, title: 'Newer' }])
    await land(1, [a, b, { ...c, title: 'Older' }])
    await Promise.all([older, newer])
    expect([titles(), doneIds(), fetches.length]).toEqual([['T1', 'T2', 'Newer'], [1], 3])
  })

  it('keeps a non-quiet load loading until its refetch commits, and wraps only that commit', async () => {
    vi.mocked(api.tasks.complete).mockResolvedValue(done(a))
    const wrap = vi.fn(async (commit: () => void) => commit())
    const load = core.loadThrough(fetchTasks, wrap)
    expect(core.loading).toBe(true)
    expect(await core.toggle(a)).toBe(true)
    await land(1, [a, b, c])
    expect([core.loading, wrap.mock.calls.length, fetches.length]).toEqual([true, 0, 3])
    await land(2, [done(a), b, c])
    await load
    expect([core.loading, wrap.mock.calls.length, doneIds()]).toEqual([false, 1, [1]])
  })

  it('waits for every overlapping write to settle, then fetches once more', async () => {
    const replies = [deferred<Task>(), deferred<Task>(), deferred<Task>()]
    let next = 0
    vi.mocked(api.tasks.complete).mockImplementation(
      () => replies[next++]?.promise ?? Promise.reject(new Error('unexpected')),
    )
    const reload = core.reload()
    const ticks = [a, b, c].map((t) => core.toggle(t))
    await land(1, [a, b, c])
    for (const [index, task] of [a, b, c].entries()) {
      expect(fetches.length).toBe(2)
      replies[index]?.resolve(done(task))
      await settle()
    }
    expect(await Promise.all(ticks)).toEqual([true, true, true])
    expect(fetches.length).toBe(3)
    await land(2, [done(a), done(b), done(c)])
    await reload
    expect([doneIds(), fetches.length]).toEqual([[1, 2, 3], 3])
  })

  it('refetches labels when a label created mid-load is missing from them', async () => {
    const cleanupFresh = $effect.root(() => {
      core = createTaskCore()
      core.bindLoad(fetchTasks, LOAD_FAILED)
    })
    flushSync()
    const gym = makeLabel({ id: 9, name: 'Gym' })
    vi.mocked(api.labels.create).mockResolvedValue(gym)
    expect(await core.ensureLabel('Gym')).toEqual(gym)
    vi.mocked(api.labels.list).mockResolvedValue([gym])
    await land(1, [a, b, c])
    expect([core.labels.map((l) => l.id), fetches.length]).toEqual([[9], 3])
    await land(2, [a, b, c])
    expect(core.labels.map((l) => l.id)).toEqual([9])
    cleanupFresh()
  })
})
