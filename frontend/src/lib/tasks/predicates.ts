import type { Task } from '../types'

type Occurrence = Pick<Task, 'id' | 'occurrence_date'>

export function isUntimed(task: Pick<Task, 'due_time'>): boolean {
  return task.due_time == null
}

export function isRecurring(task: Pick<Task, 'recurrence_rule'>): boolean {
  return task.recurrence_rule != null
}

export function sameOccurrence(a: Occurrence, b: Occurrence): boolean {
  return a.id === b.id && a.occurrence_date === b.occurrence_date
}

// A recurring series repeats its `id` across days; drag zones need one unique key per row.
export function occurrenceKey(task: Pick<Task, 'id' | 'occurrence_date' | 'due_date'>): string {
  return `${task.id}:${task.occurrence_date ?? task.due_date ?? ''}`
}

export function skippableOccurrence(task: Task): string | null {
  return isRecurring(task) ? task.occurrence_date : null
}

// Completions are never removed, so a completed occurrence only goes with its series.
export function canSkipOccurrence(task: Task): boolean {
  return skippableOccurrence(task) != null && !task.completed
}
