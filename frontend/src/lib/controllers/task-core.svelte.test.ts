import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../errors'
import { LOAD_FAILED } from '../messages'
import { MON, makeLabel, makeTask, on } from '../test/factories'
import type { Task } from '../types'
import { createComposer } from './composer.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

vi.mock('../api', () => ({
  api: {
    labels: { list: vi.fn(), create: vi.fn() },
    tasks: { create: vi.fn() },
  },
}))

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
