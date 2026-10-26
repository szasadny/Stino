// One `pending` lock so writes never interleave (drags bind `dragDisabled: core.pending`);
// every mutation is optimistic and reverts to its snapshot on failure.
import { api, type TaskInput } from '../api'
import type { Label, Task } from '../types'
import { errorMessage } from '../errors'
import { applyLabelOrder, mergeLabelOrder } from '../labels'
import { applyUntimedOrder } from '../ordering'
import {
  replaceOccurrence,
  restoreOccurrence,
  toggleCompletion,
  withoutMissedOccurrences,
  withoutOccurrence,
} from '../task-actions'
import { todayKey } from '../today.svelte'

export type TaskCore = ReturnType<typeof createTaskCore>

// A landed write must never read as failed — a retry would duplicate the task.
const REFRESH_FAILED_MSG = 'Saved, but refreshing the view failed — switch tabs to reload it.'

export function createTaskCore() {
  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let pending = $state(false)
  // Only the newest load may write state, so an out-of-order response can't land stale.
  let loadToken = 0

  // Fetch before the wrapper (e.g. a View Transition) so the network wait never lands in
  // its paused-rendering window.
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
        tasks = withoutMissedOccurrences(data.tasks, todayKey())
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
      // Loads aren't gated by `pending`; never revert over a newer load's server data.
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

  async function softReload(reload: () => Promise<void>) {
    try {
      await reload()
    } catch {
      error = REFRESH_FAILED_MSG
    }
  }

  // Hold the lock through the reload: the server assigns ids and expands recurrence.
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

    // Undo for a list that drops done rows (the Inbox).
    reopen(task: Task, index: number): Promise<boolean> {
      const open = { ...task, completed: false }
      return optimistic(
        () => {
          tasks = restoreOccurrence(tasks, open, index)
        },
        async () => {
          tasks = replaceOccurrence(tasks, await toggleCompletion({ ...task, completed: true }))
        },
        'Could not reopen the task',
      )
    },

    reorder(ids: number[]): Promise<boolean> {
      return optimistic(
        () => {
          tasks = applyUntimedOrder(tasks, ids)
        },
        () => api.tasks.reorder(ids),
        'Could not save the new order',
      )
    },

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

    remove(id: number): Promise<boolean> {
      return optimistic(
        () => {
          tasks = tasks.filter((t) => t.id !== id)
        },
        () => api.tasks.remove(id),
        'Could not delete the task',
      )
    },

    removeOccurrence(id: number, occurrenceDate: string): Promise<boolean> {
      return optimistic(
        () => {
          tasks = withoutOccurrence(tasks, id, occurrenceDate)
        },
        () => api.tasks.skipOccurrence(id, occurrenceDate),
        'Could not delete the occurrence',
      )
    },

    // Throwing CRUD for the day sheet (owns its inline error); shares the lock so its edits
    // serialize against grid toggles/drags.
    dayCrud(reload: () => Promise<void>) {
      const through = (persist: () => Promise<void>) => saveOrThrow(persist, reload)
      return {
        create: (input: TaskInput) => through(() => api.tasks.create(input).then(() => {})),
        update: (id: number, input: TaskInput) =>
          through(() => api.tasks.update(id, input).then(() => {})),
        remove: (id: number) => through(() => api.tasks.remove(id).then(() => {})),
        removeOccurrence: (id: number, occurrenceDate: string) =>
          through(() => api.tasks.skipOccurrence(id, occurrenceDate)),
      }
    },
  }
}
