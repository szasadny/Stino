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
 * Return a new list with the row matching `updated` replaced, leaving the rest
 * untouched. Rows are keyed by `(id, occurrence_date)` because a recurring task
 * shares its id across every occurrence day.
 */
export function replaceOccurrence(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) =>
    t.id === updated.id && t.occurrence_date === updated.occurrence_date ? updated : t,
  )
}
