import { api } from '../api'
import { UPDATE_TASK_FAILED } from '../messages'
import { replaceOccurrence } from '../tasks/optimistic'
import { occurrenceKey } from '../tasks/predicates'
import type { Task } from '../types'
import type { createLock } from './lock.svelte'

export type TaskList = {
  read: () => Task[]
  write: (tasks: Task[]) => void
}

type Outstanding = { latest: number; base: Task; completed: boolean }

export function persistToggle(task: Task): Promise<Task> {
  return task.completed
    ? api.tasks.uncomplete(task.id, task.occurrence_date)
    : api.tasks.complete(task.id, task.occurrence_date)
}

// `base` is the occurrence's newest known server state; only its newest tick may write the row.
export function createToggles(lock: ReturnType<typeof createLock>) {
  const outstanding = new Map<string, Outstanding>()
  let seq = 0

  function toggleIn(list: TaskList, task: Task): Promise<boolean> {
    const key = occurrenceKey(task)
    const mine = ++seq
    const entry = outstanding.get(key) ?? { latest: mine, base: task, completed: false }
    entry.latest = mine
    entry.completed = !task.completed
    outstanding.set(key, entry)
    const show = (shown: Task) => list.write(replaceOccurrence(list.read(), shown))
    return lock.queue(
      () => show({ ...task, completed: entry.completed }),
      async () => {
        const saved = await persistToggle(task)
        if (entry.latest !== mine) {
          entry.base = saved
          return
        }
        outstanding.delete(key)
        show(saved)
      },
      UPDATE_TASK_FAILED,
      () => {
        if (entry.latest !== mine) return
        outstanding.delete(key)
        show(entry.base)
      },
    )
  }

  return {
    toggleIn,
    // Re-shows the outstanding ticks on rows that replace a list, e.g. a write's snapshot revert.
    overlay(tasks: Task[]): Task[] {
      if (outstanding.size === 0) return tasks
      return tasks.map((row) => {
        const entry = outstanding.get(occurrenceKey(row))
        return entry ? { ...row, completed: entry.completed } : row
      })
    },
  }
}
