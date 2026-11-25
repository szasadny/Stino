import { api } from '../api'
import { UPDATE_TASK_FAILED } from '../messages'
import { replaceOccurrence } from '../tasks/optimistic'
import { occurrenceKey } from '../tasks/predicates'
import type { Task } from '../types'
import type { createLock } from './lock.svelte'

// `version` changes whenever a load replaces the list wholesale.
export type TaskList = {
  read: () => Task[]
  write: (tasks: Task[]) => void
  version: () => number
}

type Outstanding = { latest: number; base: Task; version: number }

export function persistToggle(task: Task): Promise<Task> {
  return task.completed
    ? api.tasks.uncomplete(task.id, task.occurrence_date)
    : api.tasks.complete(task.id, task.occurrence_date)
}

// `base` is the occurrence's last known server state; only its newest tick may write the row.
export function createToggles(lock: ReturnType<typeof createLock>) {
  const outstanding = new Map<string, Outstanding>()
  let seq = 0

  return function toggleIn(list: TaskList, task: Task): Promise<boolean> {
    const key = occurrenceKey(task)
    const mine = ++seq
    const entry = outstanding.get(key) ?? { latest: mine, base: task, version: list.version() }
    entry.latest = mine
    outstanding.set(key, entry)
    const show = (shown: Task) => list.write(replaceOccurrence(list.read(), shown))
    return lock.queue(
      () => show({ ...task, completed: !task.completed }),
      async () => {
        const saved = await persistToggle(task)
        if (entry.latest !== mine) {
          entry.base = saved
          entry.version = list.version()
          return
        }
        outstanding.delete(key)
        show(saved)
      },
      UPDATE_TASK_FAILED,
      () => {
        if (entry.latest !== mine) return
        outstanding.delete(key)
        // Loads aren't gated by the lock; never revert over a newer load's server data.
        if (list.version() === entry.version) show(entry.base)
      },
    )
  }
}
