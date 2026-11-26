import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { INBOX_COMPLETE_HOLD_MS, INBOX_COMPLETE_RETRY_MS, UNDO_TOAST_MS } from '../../lib/constants'
import { createTaskCore, type TaskCore } from '../../lib/controllers/task-core.svelte'
import { ApiError } from '../../lib/errors'
import {
  completedToast,
  NETWORK_ERROR_MESSAGE,
  SCHEDULED_TOMORROW,
  UPDATE_TASK_FAILED,
} from '../../lib/messages'
import { makeTask } from '../../lib/test/factories'
import { createInboxComplete, type InboxComplete } from './inbox-complete.svelte'

vi.mock('svelte/motion', () => ({ prefersReducedMotion: { current: false } }))
vi.mock('../../lib/api', () => ({
  api: { tasks: { complete: vi.fn(), uncomplete: vi.fn() } },
}))

const first = makeTask({ id: 1, title: 'First' })
const second = makeTask({ id: 2, title: 'Second' })
const NOTICE = SCHEDULED_TOMORROW

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
    expect(complete.message).toBe(completedToast('First'))
    expect(complete.undoable).toBe(true)

    complete.undo()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.tasks.uncomplete).toHaveBeenCalledWith(1, null)
    expect(ids()).toEqual([1, 2])
    expect(complete.message).toBeNull()
  })

  it('withdraws the undo offer after its window, restarting it for a newer completion', async () => {
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS - INBOX_COMPLETE_HOLD_MS - 1)
    complete.toggle(second)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(complete.message).toBe(completedToast('Second'))

    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS - 1)
    expect(complete.message).toBe(completedToast('Second'))
    await vi.advanceTimersByTimeAsync(1)
    expect(complete.message).toBeNull()
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
    vi.mocked(api.tasks.complete).mockRejectedValueOnce(new ApiError('network'))
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(ids()).toEqual([1, 2])
    expect(complete.message).toBeNull()
    expect(core.error).toBe(NETWORK_ERROR_MESSAGE)
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

  it('shows a notice without undo for its own window, a newer notice replacing it', async () => {
    complete.notify('Scheduled for Fri 26 June')
    expect(complete.message).toBe('Scheduled for Fri 26 June')
    expect(complete.undoable).toBe(false)
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS - 1)
    complete.notify(NOTICE)
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS - 1)
    expect(complete.message).toBe(NOTICE)
    await vi.advanceTimersByTimeAsync(1)
    expect(complete.message).toBeNull()
  })

  it('keeps an undo offer over a later notice', async () => {
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    complete.notify(NOTICE)
    expect(complete.message).toBe(completedToast('First'))
    expect(complete.undoable).toBe(true)
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_MS)
    expect(complete.message).toBeNull()
  })

  it('replaces a notice with a new undo offer', async () => {
    complete.notify(NOTICE)
    complete.toggle(first)
    await vi.advanceTimersByTimeAsync(INBOX_COMPLETE_HOLD_MS)
    expect(complete.message).toBe(completedToast('First'))
    expect(complete.undoable).toBe(true)
    complete.undo()
    expect(complete.message).toBeNull()
  })

  it('ignores undo while only a notice shows', async () => {
    complete.notify(NOTICE)
    complete.undo()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.tasks.uncomplete).not.toHaveBeenCalled()
    expect(complete.message).toBe(NOTICE)
  })
})
