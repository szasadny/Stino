import { formatShortDate } from './date'
import { DELETE, INBOX, moreTasks, NOTHING_SCHEDULED } from './messages'
import type { Task } from './types'

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function dayTaskCount(count: number): string {
  return count === 0 ? NOTHING_SCHEDULED : pluralize(count, 'task')
}

export function deleteTasksTitle(count: number): string {
  return `${DELETE} ${pluralize(count, 'task')}?`
}

export function tasksDueToday(count: number): string {
  return `${pluralize(count, 'task')} due today`
}

export function dayCellLabel(day: string, count: number, hidden = 0): string {
  const more = hidden > 0 ? `, ${moreTasks(hidden)}` : ''
  return `${day}, ${pluralize(count, 'task')}${more}`
}

export function skippedRows(count: number): string {
  return `${pluralize(count, 'row')} skipped (empty or invalid).`
}

export function taskDateLabel(task: Pick<Task, 'due_date'>): string {
  return task.due_date ? formatShortDate(task.due_date) : INBOX
}
