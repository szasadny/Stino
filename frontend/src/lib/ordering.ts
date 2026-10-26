import type { TaskGroup } from './grouping'
import type { Task } from './types'

/** The id list `api.tasks.reorder` expects; timed tasks are fixed by time. */
export function untimedReadingOrder(groups: TaskGroup[]): number[] {
  return groups.flatMap((g) => g.tasks.filter((t) => t.due_time == null).map((t) => t.id))
}

/** Display-only rule every day list applies; never persisted. */
export function completedLast<T extends { completed: boolean }>(items: T[]): T[] {
  return [...items.filter((t) => !t.completed), ...items.filter((t) => t.completed)]
}

/** Mirrors the backend's `sort_tasks` so an optimistic update lands where a reload would. */
export function sortForView(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      (a.occurrence_date ?? '').localeCompare(b.occurrence_date ?? '') ||
      Number(a.due_time == null) - Number(b.due_time == null) ||
      (a.due_time ?? '').localeCompare(b.due_time ?? '') ||
      a.sort_order - b.sort_order ||
      a.id - b.id,
  )
}

/** Touches only the tasks named in `ids`, so one day's reorder can't disturb other days in the range. */
export function applyUntimedOrder(tasks: Task[], ids: number[]): Task[] {
  const rank = new Map(ids.map((id, index) => [id, index]))
  const patched = tasks.map((t) =>
    t.due_time == null && rank.has(t.id) ? { ...t, sort_order: rank.get(t.id)! } : t,
  )
  return sortForView(patched)
}
