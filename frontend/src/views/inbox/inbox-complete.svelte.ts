import { prefersReducedMotion } from 'svelte/motion'
import { SvelteMap } from 'svelte/reactivity'
import { api } from '../../lib/api'
import { INBOX_COMPLETE_HOLD_MS, INBOX_COMPLETE_RETRY_MS, UNDO_TOAST_MS } from '../../lib/constants'
import type { TaskCore } from '../../lib/controllers/task-core.svelte'
import { completedToast, UPDATE_TASK_FAILED } from '../../lib/messages'
import type { Task } from '../../lib/types'

export type InboxComplete = ReturnType<typeof createInboxComplete>

type Timer = ReturnType<typeof setTimeout>
type Held = { task: Task; timer: Timer }
type Undoable = { task: Task; index: number }
type Toast = { message: string; undo: Undoable | null }

// Call at component init: a tick still on hold when the view goes is persisted at once.
export function createInboxComplete(core: TaskCore) {
  const held = new SvelteMap<number, Held>()
  let toast = $state.raw<Toast | null>(null)
  let expiry: Timer | undefined

  // Each toast restarts the clock, so a newer one never inherits an older one's remainder.
  function show(next: Toast | null): void {
    clearTimeout(expiry)
    toast = next
    if (next) expiry = setTimeout(() => show(null), UNDO_TOAST_MS)
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
    const undo = { task, index: core.tasks.findIndex((t) => t.id === task.id) }
    const offer = { message: completedToast(task.title), undo }
    void persist([task], () => show(offer)).then((ok) => {
      if (!ok && toast === offer) show(null)
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
    get message() {
      return toast?.message ?? null
    },
    get undoable() {
      return toast?.undo != null
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
      if (!toast?.undo) return
      const { task, index } = toast.undo
      show(null)
      void core.reopen(task, index)
    },

    // An undo offer outranks a notice: a notice never covers it, a new offer replaces a notice.
    notify(message: string): void {
      if (!toast?.undo) show({ message, undo: null })
    },
  }
}
