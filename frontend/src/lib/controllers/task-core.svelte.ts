// Shared task orchestration for Today, Month, Week, and Inbox; HTTP stays behind api.ts.
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

// Shown when a write landed but the follow-up refetch failed: the save itself must
// never read as a failure (a retry would duplicate the task), so editors close and
// this soft message points at the stale view instead.
const REFRESH_FAILED_MSG = 'Saved, but refreshing the view failed — switch tabs to reload it.'

export function createTaskCore() {
  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let pending = $state(false)
  // Only the newest load may write state.
  let loadToken = 0

  // Fetch first, then commit through a wrapper (e.g. a View Transition) so the network
  // wait never happens inside the wrapper's paused-rendering window — only the cheap
  // state swap does. `loadWith` is the plain case where the commit runs immediately.
  async function loadThrough(
    fetcher: () => Promise<{ tasks: Task[]; labels?: Label[] }>,
    commitWrap: (commit: () => void) => Promise<void>,
    failMsg = 'Could not load',
  ): Promise<void> {
    const mine = ++loadToken
    loading = true
    error = null
    try {
      const data = await fetcher()
      if (mine !== loadToken) return
      await commitWrap(() => {
        if (mine !== loadToken) return // a newer load won while the wrapper ran
        tasks = data.tasks
        if (data.labels) labels = data.labels
      })
    } catch (err) {
      if (mine === loadToken) error = errorMessage(err, failMsg)
    } finally {
      if (mine === loadToken) loading = false
    }
  }

  function loadWith(
    fetcher: () => Promise<{ tasks: Task[]; labels?: Label[] }>,
    failMsg = 'Could not load',
  ): Promise<void> {
    return loadThrough(fetcher, async (commit) => commit(), failMsg)
  }

  // Optimistic mutation primitive; returns false when locked or failed.
  async function optimistic(
    apply: () => void,
    persist: () => Promise<void>,
    failMsg: string,
  ): Promise<boolean> {
    if (pending) return false
    const snapTasks = tasks
    const snapLabels = labels
    const tokenAtStart = loadToken
    pending = true
    error = null
    apply()
    try {
      await persist()
      return true
    } catch (err) {
      // Revert only if no load began since the snapshot (loadWith isn't gated by
      // `pending`): a newer load's data is server truth and must not be clobbered.
      if (loadToken === tokenAtStart) {
        tasks = snapTasks
        labels = snapLabels
      }
      error = errorMessage(err, failMsg)
      return false
    } finally {
      pending = false
    }
  }

  // Locked runner for flows that update their own list and do not reload.
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

  // A landed persist reports reload failures through the soft refresh message.
  async function softReload(reload: () => Promise<void>) {
    try {
      await reload()
    } catch {
      error = REFRESH_FAILED_MSG
    }
  }

  // Create/update holds the lock through persist and reload because the server assigns ids
  // and expands recurrence. A reload failure after persistence still reports success.
  async function save(
    persist: () => Promise<void>,
    reload: () => Promise<void>,
    failMsg: string,
  ): Promise<boolean> {
    if (pending) return false
    pending = true
    error = null
    try {
      try {
        await persist()
      } catch (err) {
        error = errorMessage(err, failMsg)
        return false
      }
      await softReload(reload)
      return true
    } finally {
      pending = false
    }
  }

  // Variant for callers that render their own persist errors; it shares the mutation lock.
  async function saveOrThrow(
    persist: () => Promise<void>,
    reload: () => Promise<void>,
  ): Promise<void> {
    if (pending) throw new Error('A change is already in progress — try again in a moment.')
    pending = true
    try {
      await persist()
      await softReload(reload)
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
    loadThrough,
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
