import { prefersReducedMotion } from 'svelte/motion'
import { SvelteMap } from 'svelte/reactivity'
import { api } from '../../lib/api'
import { INBOX_COMPLETE_HOLD_MS, INBOX_COMPLETE_RETRY_MS, UNDO_TOAST_MS } from '../../lib/constants'
import type { TaskCore } from '../../lib/controllers/task-core.svelte'
import { UPDATE_TASK_FAILED } from '../../lib/messages'
import type { Task } from '../../lib/types'

export type InboxComplete = ReturnType<typeof createInboxComplete>

type Timer = ReturnType<typeof setTimeout>
type Held = { task: Task; timer: Timer }
type Undoable = { task: Task; index: number }

// Call at component init: a tick still on hold when the view goes is persisted at once.
export function createInboxComplete(core: TaskCore) {
  const held = new SvelteMap<number, Held>()
  let undoable = $state.raw<Undoable | null>(null)
  let expiry: Timer | undefined

  // Each offer restarts the clock, so a newer completion never inherits an older one's remainder.
  function offer(next: Undoable | null): void {
    clearTimeout(expiry)
    undoable = next
    if (next) expiry = setTimeout(() => offer(null), UNDO_TOAST_MS)
  }

  function hold(task: Task, ms: number): void {
    held.set(task.id, { task, timer: setTimeout(() => finish(task), ms) })
  }

  function persist(tasks: Task[], applied?: () => void): Promise<boolean> {
    return core.optimistic(
      () => {
        core.dropIds(tasks.map((t) => t.id))
        applied?.()
      },
      () => Promise.all(tasks.map((t) => api.tasks.complete(t.id, t.occurrence_date))),
      UPDATE_TASK_FAILED,
    )
  }

  // Waits out an in-flight mutation rather than racing the shared lock.
  function finish(task: Task): void {
    if (core.pending) {
      hold(task, INBOX_COMPLETE_RETRY_MS)
      return
    }
    held.delete(task.id)
    const shown = { task, index: core.tasks.findIndex((t) => t.id === task.id) }
    void persist([task], () => offer(shown)).then((ok) => {
      if (!ok && undoable === shown) offer(null)
    })
  }

  function flush(tasks: Task[]): void {
    if (core.pending) {
      setTimeout(() => flush(tasks), INBOX_COMPLETE_RETRY_MS)
      return
    }
    void persist(tasks)
  }

  $effect(() => () => {
    const tasks = [...held.values()].map(({ task, timer }) => {
      clearTimeout(timer)
      return task
    })
    held.clear()
    clearTimeout(expiry)
    if (tasks.length > 0) flush(tasks)
  })

  return {
    get undone() {
      return undoable?.task ?? null
    },
    isCompleting(id: number): boolean {
      return held.has(id)
    },

    toggle(task: Task): void {
      const pending = held.get(task.id)
      if (pending) {
        clearTimeout(pending.timer)
        held.delete(task.id)
        return
      }
      hold(task, prefersReducedMotion.current ? 0 : INBOX_COMPLETE_HOLD_MS)
    },

    undo(): void {
      if (!undoable) return
      const { task, index } = undoable
      offer(null)
      void core.reopen(task, index)
    },
  }
}
