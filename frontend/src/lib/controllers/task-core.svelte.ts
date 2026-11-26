import { untrack } from 'svelte'
import { api } from '../api'
import { LABEL_NAME_MAX_LENGTH } from '../constants'
import { errorMessage } from '../errors'
import { findLabelByName, labelLookup, mergeLabelOrder, nextPaletteColor } from '../labels'
import {
  CREATE_LABEL_FAILED,
  DELETE_OCCURRENCE_FAILED,
  DELETE_TASK_FAILED,
  LOAD_FAILED,
  MOVE_OCCURRENCE_FAILED,
  MOVE_TASK_FAILED,
  REOPEN_TASK_FAILED,
  SAVE_LABEL_ORDER_FAILED,
  SAVE_ORDER_FAILED,
} from '../messages'
import { onRefresh } from '../refresh.svelte'
import { isUntimedOrder } from '../tasks/day-order'
import {
  applyLabelOrder,
  applyMove,
  applyUntimedOrder,
  replaceOccurrence,
  restoreOccurrence,
  withoutOccurrence,
  withoutTasks,
} from '../tasks/optimistic'
import { withoutMissedOccurrences } from '../tasks/projection'
import { todayKey } from '../today.svelte'
import type { Label, Task } from '../types'
import { createLock } from './lock.svelte'
import { createToggles, persistToggle, type TaskList } from './toggles'

export type TaskCore = ReturnType<typeof createTaskCore>

type Loaded = { tasks: Task[]; labels?: Label[] }
type CommitWrap = (commit: () => void) => Promise<void>
type CoreState = { tasks: Task[]; labels: Label[] }
type Optimistic = (
  apply: () => void,
  persist: () => Promise<unknown>,
  failMsg: string,
) => Promise<boolean>

const commitNow: CommitWrap = async (commit) => commit()

// One lock serializes every write (drags bind `pending`); mutations revert on failure.
export function createTaskCore() {
  const lock = createLock()
  const state = $state<CoreState>({ tasks: [], labels: [] })
  let loading = $state(true)
  const labelFor = $derived(labelLookup(state.labels))
  // Only the newest load may write state, so an out-of-order response can't land stale.
  let loadToken = 0
  let source: { fetchTasks: () => Promise<Task[]>; failMsg: string } | null = null
  const toggles = createToggles(lock)
  const list: TaskList = {
    read: () => state.tasks,
    write: (tasks) => (state.tasks = tasks),
  }

  // `quiet` refreshes the same scope without the loading state, so lists never blank.
  async function load(
    fetcher: () => Promise<Loaded>,
    commitWrap: CommitWrap,
    failMsg: string,
    quiet: boolean,
  ): Promise<void> {
    const mine = ++loadToken
    const withTicks = toggles.beginLoad()
    if (!quiet) loading = true
    lock.clearError()
    try {
      const data = await fetcher()
      if (mine !== loadToken) return
      await commitWrap(() => {
        if (mine !== loadToken) return
        state.tasks = withoutMissedOccurrences(withTicks(data.tasks), todayKey())
        if (data.labels) state.labels = data.labels
      })
    } catch (err) {
      if (mine === loadToken) lock.fail(errorMessage(err, failMsg))
    } finally {
      if (mine === loadToken) loading = false
    }
  }

  function reload(): Promise<void> {
    const bound = source
    if (!bound) return Promise.resolve()
    return load(async () => ({ tasks: await bound.fetchTasks() }), commitNow, bound.failMsg, true)
  }

  function optimistic(
    apply: () => void,
    persist: () => Promise<unknown>,
    failMsg: string,
  ): Promise<boolean> {
    const snapTasks = state.tasks
    const snapLabels = state.labels
    const tokenAtStart = loadToken
    return lock.optimistic(apply, persist, failMsg, () => {
      // Loads aren't gated by the lock; never revert over a newer load's server data.
      if (loadToken !== tokenAtStart) return
      state.tasks = toggles.overlay(snapTasks)
      state.labels = snapLabels
    })
  }

  return {
    get tasks() {
      return state.tasks
    },
    get labels() {
      return state.labels
    },
    get labelFor() {
      return labelFor
    },
    get loading() {
      return loading
    },
    get error() {
      return lock.error
    },
    get pending() {
      return lock.pending
    },
    clearError: lock.clearError,
    run: lock.run,
    save: lock.save,
    optimistic,
    reload,
    toggle: (task: Task) => toggles.toggleIn(list, task),
    toggles,

    // Call at component init: loads once mounted, then quietly on every refresh bump.
    bindLoad(fetchTasks: () => Promise<Task[]>, failMsg: string): void {
      source = { fetchTasks, failMsg }
      const loadAll = (quiet: boolean) =>
        load(
          async () => {
            const [loadedTasks, loadedLabels] = await Promise.all([fetchTasks(), api.labels.list()])
            return { tasks: loadedTasks, labels: loadedLabels }
          },
          commitNow,
          failMsg,
          quiet,
        )
      $effect(() => untrack(() => void loadAll(false)))
      onRefresh(() => loadAll(true))
    },

    // Fetch before the wrapper (a View Transition) so the network never lands in its paused window.
    loadThrough(
      fetchTasks: () => Promise<Task[]>,
      commitWrap: CommitWrap,
      failMsg = source?.failMsg ?? LOAD_FAILED,
    ): Promise<void> {
      return load(async () => ({ tasks: await fetchTasks() }), commitWrap, failMsg, false)
    },

    insert(task: Task): void {
      state.tasks = [...state.tasks, task]
    },

    patch(task: Task): void {
      state.tasks = replaceOccurrence(state.tasks, task)
    },

    dropIds(ids: Iterable<number>): void {
      state.tasks = withoutTasks(state.tasks, ids)
    },
    ...createWrites(state, lock, optimistic, reload),
  }
}

function createWrites(
  state: CoreState,
  lock: ReturnType<typeof createLock>,
  optimistic: Optimistic,
  reload: () => Promise<void>,
) {
  return {
    async ensureLabel(name: string): Promise<Label | null> {
      const clean = name.trim().slice(0, LABEL_NAME_MAX_LENGTH)
      const found = findLabelByName(state.labels, clean)
      if (found) return found
      // Outside the lock: a busy task write must not swallow the user's pick.
      try {
        const color = nextPaletteColor(state.labels)
        const label = await api.labels.create({ name: clean, color, emoji: null })
        state.labels = [...state.labels, label]
        return label
      } catch (err) {
        lock.fail(errorMessage(err, CREATE_LABEL_FAILED))
        return null
      }
    },

    // Undo for a list that drops done rows (the Inbox).
    reopen(task: Task, index: number): Promise<boolean> {
      const open = { ...task, completed: false }
      return optimistic(
        () => {
          state.tasks = restoreOccurrence(state.tasks, open, index)
        },
        async () => {
          state.tasks = replaceOccurrence(
            state.tasks,
            await persistToggle({ ...task, completed: true }),
          )
        },
        REOPEN_TASK_FAILED,
      )
    },

    reorder(ids: number[]): Promise<boolean> {
      if (isUntimedOrder(state.tasks, ids)) return Promise.resolve(true)
      return optimistic(
        () => {
          state.tasks = applyUntimedOrder(state.tasks, ids)
        },
        () => api.tasks.reorder(ids),
        SAVE_ORDER_FAILED,
      )
    },

    reorderLabels(visibleIds: number[]): Promise<boolean> {
      const ids = mergeLabelOrder(state.labels, visibleIds)
      return optimistic(
        () => {
          state.labels = applyLabelOrder(state.labels, ids)
        },
        () => api.labels.reorder(ids),
        SAVE_LABEL_ORDER_FAILED,
      )
    },

    remove(id: number): Promise<boolean> {
      return optimistic(
        () => {
          state.tasks = state.tasks.filter((t) => t.id !== id)
        },
        () => api.tasks.remove(id),
        DELETE_TASK_FAILED,
      )
    },

    removeOccurrence(id: number, occurrenceDate: string): Promise<boolean> {
      return optimistic(
        () => {
          state.tasks = withoutOccurrence(state.tasks, id, occurrenceDate)
        },
        () => api.tasks.skipOccurrence(id, occurrenceDate),
        DELETE_OCCURRENCE_FAILED,
      )
    },

    moveToDay(id: number, dateKey: string, reorderIds: number[] | null): Promise<boolean> {
      return optimistic(
        () => {
          state.tasks = applyMove(state.tasks, id, dateKey)
        },
        async () => {
          await api.tasks.update(id, { due_date: dateKey })
          if (!reorderIds) return
          try {
            await api.tasks.reorder(reorderIds)
          } catch (err) {
            // The date write landed: reload so the revert can't put it back on the old day.
            void reload()
            throw err
          }
        },
        MOVE_TASK_FAILED,
      )
    },

    // The server splits the occurrence off into a new one-off, so reload for its id.
    moveOccurrence(id: number, occurrenceDate: string, newDate: string): Promise<boolean> {
      return lock.save(
        () => api.tasks.moveOccurrence(id, occurrenceDate, newDate),
        reload,
        MOVE_OCCURRENCE_FAILED,
      )
    },
  }
}
