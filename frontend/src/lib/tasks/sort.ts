import type { Task } from '../types'
import { isUntimed } from './predicates'

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
