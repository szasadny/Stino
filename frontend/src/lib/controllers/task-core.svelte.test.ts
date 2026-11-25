import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../errors'
import { LOAD_FAILED, UPDATE_TASK_FAILED } from '../messages'
import { MON, deferred, done, makeLabel, makeTask, on, recurring } from '../test/factories'
import type { Task } from '../types'
import { createComposer } from './composer.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

vi.mock('../api', () => ({
  api: {
    labels: { list: vi.fn(), create: vi.fn() },
    tasks: { create: vi.fn(), complete: vi.fn(), uncomplete: vi.fn(), reorder: vi.fn() },
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

  it('never reverts a failed tick over a newer reload', async () => {
    void core.toggle(a)
    const second = core.toggle(b)
    reply(0).resolve(done(a))
    await settle()
    fetchTasks.mockResolvedValue([done(a), { ...b, title: 'Server' }])
    await core.reload()
    reply(1).reject(new ApiError('server'))
    expect(await second).toBe(false)
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
