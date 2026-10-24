// Shared occurrence-aware task list actions.
import { api } from './api'
import type { Task } from './types'

/**
 * Complete or reopen `task` for the occurrence it represents, returning the
 * updated occurrence row from the server. The caller owns its own busy/error
 * state and applies the result with [`replaceOccurrence`].
 */
export function toggleCompletion(task: Task): Promise<Task> {
  return task.completed
    ? api.tasks.uncomplete(task.id, task.occurrence_date)
    : api.tasks.complete(task.id, task.occurrence_date)
}

/**
 * The instance date to skip when deleting just this row instead of its whole
 * series: set only for a recurring row that carries an occurrence date. A
 * one-off (or a row without an instance) has no single occurrence to delete.
 */
export function skippableOccurrence(task: Task): string | null {
  return task.recurrence_rule != null ? task.occurrence_date : null
}

/**
 * Whether this row's single occurrence may be deleted on its own: a recurring
 * instance that is NOT completed. Completions are history and are never
 * removed, so a completed occurrence can only go with its whole series.
 */
export function canSkipOccurrence(task: Task): boolean {
  return skippableOccurrence(task) != null && !task.completed
}

/**
 * Return a new list without the one `(id, occurrenceDate)` row — the optimistic
 * mirror of deleting a single recurring occurrence.
 */
export function withoutOccurrence(tasks: Task[], id: number, occurrenceDate: string): Task[] {
  return tasks.filter((t) => !(t.id === id && t.occurrence_date === occurrenceDate))
}

/**
 * Return a new list with the row matching `updated` replaced, leaving the rest
 * untouched. Rows are keyed by `(id, occurrence_date)` because a recurring task
 * shares its id across every occurrence day.
 */
export function replaceOccurrence(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) =>
    t.id === updated.id && t.occurrence_date === updated.occurrence_date ? updated : t,
  )
}
