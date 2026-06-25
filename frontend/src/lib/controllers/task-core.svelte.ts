// The one task-orchestration controller, shared by Today / Month / Week / Inbox so the
// load + mutate + error + in-flight handling lives in exactly one place instead of being
// re-implemented (and drifting) per view. A rune factory rather than a component: the views
// need identical orchestration but very different markup, so each instantiates this at
// component-init and binds its reactive getters + actions. HTTP stays behind lib/api.ts.
//
// Two invariants every mutation upholds:
//  • ONE `pending` lock — every mutating action (toggle, reorder, move, remove, save) bails
//    while another is in flight, so writes can't interleave and a drag can be disabled while
//    a save runs (`dragDisabled: core.pending`).
//  • Uniform optimistic update — apply locally, persist, REVERT to the pre-change snapshot on
//    failure. Loads are sequence-token guarded so an out-of-order response can't land stale.
import { api, type TaskInput } from '../api'
import type { Label, Task } from '../types'
import { errorMessage } from '../errors'
import { applyLabelOrder, mergeLabelOrder } from '../labels'
import { applyUntimedOrder } from '../ordering'
import { replaceOccurrence, toggleCompletion } from '../task-actions'

export type TaskCore = ReturnType<typeof createTaskCore>

export function createTaskCore() {
  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let pending = $state(false)
  // Monotonic token: only the newest load may write state, so rapid navigation can't let a
  // slow earlier response land last.
  let loadToken = 0

  async function loadWith(
    fetcher: () => Promise<{ tasks: Task[]; labels?: Label[] }>,
    failMsg = 'Could not load',
  ): Promise<void> {
    const mine = ++loadToken
    loading = true
    error = null
    try {
      const data = await fetcher()
      if (mine !== loadToken) return
      tasks = data.tasks
      if (data.labels) labels = data.labels
    } catch (err) {
      if (mine === loadToken) error = errorMessage(err, failMsg)
    } finally {
      if (mine === loadToken) loading = false
    }
  }

  // The one optimistic mutation primitive. Returns false if it bailed (lock held) or failed,
  // true on success — callers use it to decide e.g. whether to close an editor.
  async function optimistic(
    apply: () => void,
    persist: () => Promise<void>,
    failMsg: string,
  ): Promise<boolean> {
    if (pending) return false
    const snapTasks = tasks
    const snapLabels = labels
    pending = true
    error = null
    apply()
    try {
      await persist()
      return true
    } catch (err) {
      tasks = snapTasks
      labels = snapLabels
      error = errorMessage(err, failMsg)
      return false
    } finally {
      pending = false
    }
  }

  // A bare locked async run for bespoke flows that own their own list update (the Inbox's
  // quick-add, composer submit, and bulk ops, which append/filter locally rather than reload
  // or optimistically revert). Holds the lock and routes errors through `error`.
  async function run(fn: () => Promise<void>, failMsg: string): Promise<boolean> {
    if (pending) return false
    pending = true
    error = null
    try {
      await fn()
      return true
    } catch (err) {
      error = errorMessage(err, failMsg)
      return false
    } finally {
      pending = false
    }
  }

  // For create/update, where the server assigns the id / expands recurrence, so a reload is
  // the correct resync rather than an optimistic insert. Holds the lock across persist+reload.
  async function save(
    persist: () => Promise<void>,
    reload: () => Promise<void>,
    failMsg: string,
  ): Promise<boolean> {
    if (pending) return false
    pending = true
    error = null
    try {
      await persist()
      await reload()
      return true
    } catch (err) {
      error = errorMessage(err, failMsg)
      return false
    } finally {
      pending = false
    }
  }

  // Like `save`, but for a caller that renders its OWN error rather than `core.error` — the
  // day-sheet composer, whose error must show inline over the grid, not behind the modal.
  // Same `pending` lock + reload-on-success, but it RETHROWS the failure so the caller can
  // catch it. Serialized with every other mutation: if a change is already in flight it throws
  // (the caller keeps its editor open to retry) rather than running unlocked.
  async function saveOrThrow(
    persist: () => Promise<void>,
    reload: () => Promise<void>,
  ): Promise<void> {
    if (pending) throw new Error('A change is already in progress — try again in a moment.')
    pending = true
    try {
      await persist()
      await reload()
    } finally {
      pending = false
    }
  }

  return {
    get tasks() {
      return tasks
    },
    set tasks(v: Task[]) {
      tasks = v
    },
    get labels() {
      return labels
    },
    set labels(v: Label[]) {
      labels = v
    },
    get loading() {
      return loading
    },
    get error() {
      return error
    },
    set error(v: string | null) {
      error = v
    },
    get pending() {
      return pending
    },
    loadWith,
    optimistic,
    run,
    save,

    // Complete/reopen the occurrence this row represents: flip optimistically, then reconcile
    // with the authoritative occurrence row the server returns.
    toggle(task: Task): Promise<boolean> {
      return optimistic(
        () => {
          tasks = replaceOccurrence(tasks, { ...task, completed: !task.completed })
        },
        async () => {
          tasks = replaceOccurrence(tasks, await toggleCompletion(task))
        },
        'Could not update the task',
      )
    },

    // Persist a manual untimed order (drag-to-reorder in a day view / the Inbox).
    reorder(ids: number[]): Promise<boolean> {
      return optimistic(
        () => {
          tasks = applyUntimedOrder(tasks, ids)
        },
        () => api.tasks.reorder(ids),
        'Could not save the new order',
      )
    },

    // Reorder the visible label sections; fold them into the global label order, then save.
    reorderLabels(visibleIds: number[]): Promise<boolean> {
      const ids = mergeLabelOrder(labels, visibleIds)
      return optimistic(
        () => {
          labels = applyLabelOrder(labels, ids)
        },
        () => api.labels.reorder(ids),
        'Could not save the label order',
      )
    },

    // Delete a task: drop it locally, then persist (revert on failure).
    remove(id: number): Promise<boolean> {
      return optimistic(
        () => {
          tasks = tasks.filter((t) => t.id !== id)
        },
        () => api.tasks.remove(id),
        'Could not delete the task',
      )
    },

    // Throwing create/update/delete bound to a view's range `reload`, for the Month/Week day
    // sheet (which owns its inline error). Each routes through the shared `pending` lock and
    // reloads on success, so a day-sheet edit serializes against grid toggles/drags and the
    // grid re-renders from fresh data — closing the gap where a view called `api.tasks.*`
    // directly. The server assigns the id / re-expands recurrence, so a reload is the resync.
    dayCrud(reload: () => Promise<void>) {
      const through = (persist: () => Promise<void>) => saveOrThrow(persist, reload)
      return {
        create: (input: TaskInput) => through(() => api.tasks.create(input).then(() => {})),
        update: (id: number, input: TaskInput) =>
          through(() => api.tasks.update(id, input).then(() => {})),
        remove: (id: number) => through(() => api.tasks.remove(id).then(() => {})),
      }
    },
  }
}
