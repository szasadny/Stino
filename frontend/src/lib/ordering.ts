// The one manual order, shared by every view. Untimed tasks carry a global
// `sort_order`; timed tasks are pinned by their time. A reorder anywhere persists
// the FULL set of a day's untimed ids in grouped reading order, so the flat
// month/week cell (which sorts untimed by `sort_order`) shows the same sequence the
// grouped day view reads top-to-bottom. Pure logic so it's unit-testable.
import type { TaskGroup } from './grouping'
import type { Task } from './types'

/**
 * The day's UNTIMED task ids in grouped reading order — `groupByLabel` group order,
 * then each group's own order. Timed tasks are excluded (they're fixed by time).
 * This exact list is what we send to `api.tasks.reorder`.
 */
export function untimedReadingOrder(groups: TaskGroup[]): number[] {
  return groups.flatMap((g) => g.tasks.filter((t) => t.due_time == null).map((t) => t.id))
}

/**
 * The canonical view sort, mirroring the backend (`task_service::sort_tasks`): by
 * occurrence day, then timed tasks first by time, then manual `sort_order`, then id.
 * `occurrence_date`/`due_time` are `YYYY-MM-DD`/`HH:MM`, so a lexicographic compare is
 * chronological. Used so an optimistic update lands in exactly the order a reload would.
 */
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

/**
 * Apply a manual untimed order to `tasks` without a refetch. Only the untimed tasks
 * named in `ids` are repositioned: each gets `sort_order` set to its index in `ids`.
 * EVERY other task is preserved untouched — crucially, untimed tasks on OTHER days
 * (when `tasks` is a whole month/week range, not a single day) keep their order, so a
 * day's reorder can't wipe the rest of the calendar. The result is re-sorted with the
 * same rule the server uses, so the optimistic update matches a reload. Ids not present
 * (or pointing at a timed task) are ignored.
 */
export function applyUntimedOrder(tasks: Task[], ids: number[]): Task[] {
  const rank = new Map(ids.map((id, index) => [id, index]))
  const patched = tasks.map((t) =>
    t.due_time == null && rank.has(t.id) ? { ...t, sort_order: rank.get(t.id)! } : t,
  )
  return sortForView(patched)
}
