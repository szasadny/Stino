import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../errors'
import { MON, deferred, done, on } from '../test/factories'
import type { Task } from '../types'
import { createLock } from './lock.svelte'
import { createToggles, persistToggle, type TaskList } from './toggles'

vi.mock('../api', () => ({
  api: { tasks: { complete: vi.fn(), uncomplete: vi.fn() } },
}))

describe('persistToggle', () => {
  it('completes an open occurrence and reopens a done one', async () => {
    vi.mocked(api.tasks.complete).mockResolvedValue(done(on(MON)))
    vi.mocked(api.tasks.uncomplete).mockResolvedValue(on(MON))
    expect((await persistToggle(on(MON))).completed).toBe(true)
    expect((await persistToggle(done(on(MON)))).completed).toBe(false)
    expect(api.tasks.complete).toHaveBeenCalledWith(1, MON)
    expect(api.tasks.uncomplete).toHaveBeenCalledWith(1, MON)
  })
})

describe('createToggles', () => {
  const task = on(MON, { id: 1 })
  let rows: Task[]
  let list: TaskList

  beforeEach(() => {
    vi.clearAllMocks()
    rows = [task]
    list = { read: () => rows, write: (next) => (rows = next) }
  })

  it('restores the state an earlier tick saved when the newest tick fails', async () => {
    const saved = deferred<Task>()
    vi.mocked(api.tasks.complete).mockReturnValue(saved.promise)
    vi.mocked(api.tasks.uncomplete).mockRejectedValue(new ApiError('server'))
    const { toggleIn } = createToggles(createLock())
    void toggleIn(list, task)
    const untick = toggleIn(list, done(task))
    saved.resolve(done(task))
    expect(await untick).toBe(false)
    expect(rows[0]?.completed).toBe(true)
  })

  it('re-shows an outstanding tick on rows that replace the list', async () => {
    const saving = deferred<Task>()
    vi.mocked(api.tasks.complete).mockReturnValue(saving.promise)
    const toggles = createToggles(createLock())
    const tick = toggles.toggleIn(list, task)
    expect(toggles.overlay([task, on(MON, { id: 2 })]).map((t) => t.completed)).toEqual([
      true,
      false,
    ])
    saving.resolve(done(task))
    expect(await tick).toBe(true)
    expect(toggles.overlay([task])[0]?.completed).toBe(false)
  })
})
