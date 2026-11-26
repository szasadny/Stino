import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { createTaskCore, type TaskCore } from '../../lib/controllers/task-core.svelte'
import { ApiError } from '../../lib/errors'
import { LOAD_FAILED, UPDATE_SELECTED_FAILED } from '../../lib/messages'
import { MON, makeTask } from '../../lib/test/factories'
import type { Task } from '../../lib/types'
import { createInboxSelect, type InboxSelect } from './inbox-select.svelte'

vi.mock('../../lib/api', () => ({
  api: {
    labels: { list: vi.fn() },
    tasks: { batch: vi.fn() },
  },
}))

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createInboxSelect', () => {
  let core: TaskCore
  let select: InboxSelect
  let fetchTasks: ReturnType<typeof vi.fn<() => Promise<Task[]>>>
  let cleanup: () => void

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(api.labels.list).mockResolvedValue([])
    vi.mocked(api.tasks.batch).mockResolvedValue()
    fetchTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValue([1, 2, 3].map((id) => makeTask({ id })))
    cleanup = $effect.root(() => {
      core = createTaskCore()
      core.bindLoad(fetchTasks, LOAD_FAILED)
      select = createInboxSelect(core)
    })
    flushSync()
    await settle()
    select.enter()
  })

  afterEach(() => cleanup())

  const ids = () => core.tasks.map((t) => t.id)

  it('toggles single rows and the whole list', () => {
    select.toggle(1)
    select.toggle(3)
    expect(select.ids).toEqual([1, 3])
    select.toggle(1)
    expect(select.ids).toEqual([3])

    select.toggleAll()
    expect(select.allSelected).toBe(true)
    select.toggleAll()
    expect(select.ids).toEqual([])
  })

  it('forgets picked tasks that a reload no longer lists', async () => {
    select.toggle(1)
    select.toggle(2)
    fetchTasks.mockResolvedValue([2, 3].map((id) => makeTask({ id })))
    await core.reload()
    expect(select.ids).toEqual([2])
    expect(select.has(2)).toBe(true)

    await select.complete()
    expect(api.tasks.batch).toHaveBeenCalledWith([2], { type: 'complete' })
    expect(ids()).toEqual([3])
  })

  it('labels the selected rows in place and leaves select mode', async () => {
    select.toggle(2)
    await select.setLabel(7)
    expect(api.tasks.batch).toHaveBeenCalledWith([2], { type: 'label', label_id: 7 })
    expect(core.tasks.map((t) => t.label_id)).toEqual([null, 7, null])
    expect(select.active).toBe(false)
    expect(select.ids).toEqual([])
  })

  it.each([
    ['schedule', () => select.schedule(MON), { type: 'schedule', due_date: MON }],
    ['delete', () => select.remove(), { type: 'delete' }],
  ])('drops the rows it %ss', async (_name, run, op) => {
    select.toggle(1)
    select.toggle(3)
    await run()
    expect(api.tasks.batch).toHaveBeenCalledWith([1, 3], op)
    expect(ids()).toEqual([2])
  })

  it('keeps the selection and shows the error when the batch fails', async () => {
    vi.mocked(api.tasks.batch).mockRejectedValueOnce(new ApiError('server'))
    select.toggle(1)
    await select.remove()
    expect(ids()).toEqual([1, 2, 3])
    expect(select.active).toBe(true)
    expect(select.ids).toEqual([1])
    expect(core.error).toBe(UPDATE_SELECTED_FAILED)
  })

  it('sends nothing for an empty selection', async () => {
    await select.complete()
    expect(api.tasks.batch).not.toHaveBeenCalled()
  })
})
