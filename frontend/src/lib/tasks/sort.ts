import type { Task } from '../types'
import { isRecurring, isUntimed } from './predicates'

type Ordered = { id: number; sort_order: number }

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function compareSortOrder(a: Ordered, b: Ordered): number {
  return a.sort_order - b.sort_order || a.id - b.id
}

// Mirrors the backend's `sort_tasks` so an optimistic update lands where a reload would.
export function sortForView(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      compareText(a.occurrence_date ?? '', b.occurrence_date ?? '') ||
      Number(isUntimed(a)) - Number(isUntimed(b)) ||
      compareText(a.due_time ?? '', b.due_time ?? '') ||
      compareSortOrder(a, b),
  )
}

// Display-only; never persisted.
export function completedLast<T extends { completed: boolean }>(items: T[]): T[] {
  return [...items.filter((t) => !t.completed), ...items.filter((t) => t.completed)]
}

const UPCOMING = 0
const UNDATED = 1
const PAST = 2
const DONE = 3

type Ranked = { task: Task; group: number; date: string }

const titleOrder = new Intl.Collator(undefined, { sensitivity: 'accent' })

// A search row stands for a whole series dated by its start, so a running series counts as today.
function rankForSearch(task: Task, today: string): Ranked {
  const date = task.due_date
  const series = isRecurring(task)
  if (task.completed && !series) return { task, group: DONE, date: date ?? '' }
  if (!date) return { task, group: UNDATED, date: '' }
  if (series || date >= today) {
    return { task, group: UPCOMING, date: date < today ? today : date }
  }
  return { task, group: PAST, date }
}

function compareInGroup(a: Ranked, b: Ranked): number {
  if (a.group !== UPCOMING) return compareText(b.date, a.date)
  return (
    compareText(a.date, b.date) ||
    Number(isUntimed(a.task)) - Number(isUntimed(b.task)) ||
    compareText(a.task.due_time ?? '', b.task.due_time ?? '')
  )
}

// Upcoming (nearest first), undated, past (latest first), then completed (latest first).
export function sortForSearch(tasks: Task[], today: string): Task[] {
  return tasks
    .map((task) => rankForSearch(task, today))
    .sort(
      (a, b) =>
        a.group - b.group || compareInGroup(a, b) || titleOrder.compare(a.task.title, b.task.title),
    )
    .map((ranked) => ranked.task)
}
