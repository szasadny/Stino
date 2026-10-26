import { api } from './api'
import type { Task } from './types'

export function toggleCompletion(task: Task): Promise<Task> {
  return task.completed
    ? api.tasks.uncomplete(task.id, task.occurrence_date)
    : api.tasks.complete(task.id, task.occurrence_date)
}

export function skippableOccurrence(task: Task): string | null {
  return task.recurrence_rule != null ? task.occurrence_date : null
}

/** Completions are never removed, so a completed occurrence only goes with its series. */
export function canSkipOccurrence(task: Task): boolean {
  return skippableOccurrence(task) != null && !task.completed
}

export function withoutOccurrence(tasks: Task[], id: number, occurrenceDate: string): Task[] {
  return tasks.filter((t) => !(t.id === id && t.occurrence_date === occurrenceDate))
}

/** Keyed by `(id, occurrence_date)`: a recurring task shares its id across days. */
export function replaceOccurrence(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) =>
    t.id === updated.id && t.occurrence_date === updated.occurrence_date ? updated : t,
  )
}

/** Replaces in place if a reload already brought it back. */
export function restoreOccurrence(tasks: Task[], task: Task, index: number): Task[] {
  if (tasks.some((t) => t.id === task.id && t.occurrence_date === task.occurrence_date)) {
    return replaceOccurrence(tasks, task)
  }
  const at = Math.max(0, Math.min(index, tasks.length))
  return [...tasks.slice(0, at), task, ...tasks.slice(at)]
}
