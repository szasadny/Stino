import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { INBOX_COMPLETE_HOLD_MS, INBOX_COMPLETE_RETRY_MS, UNDO_TOAST_MS } from '../../lib/constants'
import { createTaskCore, type TaskCore } from '../../lib/controllers/task-core.svelte'
import { UPDATE_TASK_FAILED } from '../../lib/messages'
import { makeTask } from '../../lib/test/factories'
import { createInboxComplete, type InboxComplete } from './inbox-complete.svelte'

vi.mock('svelte/motion', () => ({ prefersReducedMotion: { current: false } }))
vi.mock('../../lib/api', () => ({
  api: { tasks: { complete: vi.fn(), uncomplete: vi.fn() } },
}))

const first = makeTask({ id: 1 })
const second = makeTask({ id: 2 })

describe('createInboxComplete', () => {
  let core: TaskCore
  let complete: InboxComplete
  let cleanup: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(api.tasks.complete).mockImplementation(async (id) =>
      makeTask({ id, completed: true }),
    )
    vi.mocked(api.tasks.uncomplete).mockImplementation(async (id) => makeTask({ id }))
    cleanup = $effect.root(() => {
      core = createTaskCore()
      complete = createInboxComplete(core)
    })
    flushSync()
    core.insert(first)
    core.insert(second)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const ids = () => core.tasks.map((t) => t.id)

  function unmount() {
    cleanup()
    cleanup = () => {}
  }

  function holdLock(): () => void {
    let release = () => {}
    void core.run(() => new Promise<void>((resolve) => (release = resolve)), UPDATE_TASK_FAILED)
    flushSync()
    return release
  }

  it('completes after the hold and offers an undo that restores the row in place', async () => {
    complete.toggle(first)
    expect(complete.isCompleting(1)).toBe(true)
    expect(api.tasks.complete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(api.tasks.complete).toHaveBeenCalledWith(1, null)
    expect(ids()).toEqual([2])
    expect(complete.isCompleting(1)).toBe(false)
    expect(complete.undone?.id).toBe(1)

    complete.undo()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.tasks.uncomplete).toHaveBeenCalledWith(1, null)
    expect(ids()).toEqual([1, 2])
    expect(complete.undone).toBeNull()
  })

  it('withdraws the undo offer after its window, restarting it for a newer completion', async () => {
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS - INBOX_COMPLETE_HOLD_MS - 1)
    complete.toggle(second)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(complete.undone?.id).toBe(2)

    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS - 1)
    expect(complete.undone?.id).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(complete.undone).toBeNull()
  })

  it('cancels when ticked again during the hold', async () => {
    complete.toggle(first)
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS * 2)
    expect(api.tasks.complete).not.toHaveBeenCalled()
    expect(ids()).toEqual([1, 2])
  })

  it('waits for an in-flight write before completing', async () => {
    complete.toggle(first)
    const release = holdLock()
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(api.tasks.complete).not.toHaveBeenCalled()

    release()
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_RETRY_MS)
    expect(api.tasks.complete).toHaveBeenCalledOnce()
    expect(ids()).toEqual([2])
  })

  it('puts the row back and drops the undo when the write fails', async () => {
    vi.mocked(api.tasks.complete).mockRejectedValueOnce(new Error('down'))
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(ids()).toEqual([1, 2])
    expect(complete.undone).toBeNull()
    expect(core.error).toBe('down')
  })

  it('persists every held tick at once when torn down, and nothing fires later', async () => {
    complete.toggle(first)
    complete.toggle(second)
    unmount()
    expect(api.tasks.complete).toHaveBeenCalledTimes(2)
    expect(ids()).toEqual([])

    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS * 2)
    expect(api.tasks.complete).toHaveBeenCalledTimes(2)
  })

  it('still persists a held tick torn down while another write is in flight', async () => {
    complete.toggle(first)
    const release = holdLock()
    unmount()
    expect(api.tasks.complete).not.toHaveBeenCalled()

    release()
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_RETRY_MS)
    expect(api.tasks.complete).toHaveBeenCalledExactlyOnceWith(1, null)
  })
})
