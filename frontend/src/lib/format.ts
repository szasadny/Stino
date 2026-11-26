import { formatShortDate, quickDates } from './date'
import {
  DELETE,
  INBOX,
  moreTasks,
  NOTHING_SCHEDULED,
  SCHEDULED_TODAY,
  SCHEDULED_TOMORROW,
  scheduledFor,
} from './messages'
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

export function taskDateLabel(task: Pick<Task, 'due_date'>, currentYear: number): string {
  return task.due_date ? formatShortDate(task.due_date, currentYear) : INBOX
}

export function scheduledNotice(dueDate: string, today: Date): string {
  const near = quickDates(today)
  if (dueDate === near.today) return SCHEDULED_TODAY
  if (dueDate === near.tomorrow) return SCHEDULED_TOMORROW
  return scheduledFor(formatShortDate(dueDate, today.getFullYear()))
}
