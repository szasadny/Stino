// The month/week grid as drag-and-drop zones: one mutable list of items per day,
// keyed by ISO date. svelte-dnd-action tracks items by their `id` property, but a
// recurring task carries the SAME numeric id on every occurrence day — so under a
// shared zone type those duplicate ids would corrupt cross-zone tracking. We wrap
// each task in a `CellItem` whose `id` is unique per (task, day). Pure logic so the
// views stay thin and this is unit-testable.
import type { Label, Task } from './types'
import { labelDayOrder } from './grouping'

/** A draggable pill in a day cell. `id` is globally unique (see `cellItemId`). */
export interface CellItem {
  id: string
  task: Task
}

/**
 * A stable, globally-unique id for a task on a given day. A recurring series
 * repeats its numeric `id` across days, so we qualify it with the occurrence day
 * (falling back to the series start, then empty) to keep svelte-dnd-action's
 * id-based drag tracking sound.
 */
export function cellItemId(task: Task): string {
  return `${task.id}:${task.occurrence_date ?? task.due_date ?? ''}`
}

/**
 * Bucket a loaded range into one `CellItem[]` per day. EVERY key in `dayKeys` is
 * seeded with an array — including empty days, so they are valid drop targets.
 * Tasks with no `occurrence_date` (unscheduled) and tasks whose day is outside the
 * grid are skipped. Per-day input order (the server's timed-first/sort_order order)
 * is preserved — unless `labelOrder` is given, in which case each day is projected
 * through `labelDayOrder` (timed stay first by time; untimed regroup by label).
 */
export function buildBoard(
  tasks: Task[],
  dayKeys: string[],
  labelOrder?: Label[],
): Record<string, CellItem[]> {
  const byDay: Record<string, Task[]> = {}
  for (const key of dayKeys) byDay[key] = []
  for (const task of tasks) {
    const key = task.occurrence_date
    if (key == null) continue
    byDay[key]?.push(task)
  }
  const board: Record<string, CellItem[]> = {}
  for (const key of dayKeys) {
    const day = labelOrder ? labelDayOrder(byDay[key], labelOrder) : byDay[key]
    board[key] = day.map((task) => ({ id: cellItemId(task), task }))
  }
  return board
}

/**
 * The destination day's untimed task ids after a task is dragged onto it from
 * another day — the tasks already there, in their current order, with the moved
 * task appended at the end. This is what we send to `api.tasks.reorder` so the
 * incoming task *joins* the day without disturbing the order of the tasks already
 * on it. `tasks` is the loaded range in server (sorted) order; only untimed tasks
 * carry a manual order, so timed tasks are excluded (they sort by time). The moved
 * id is filtered from the existing set (it may still carry its old day in `tasks`)
 * and appended exactly once.
 */
export function appendedUntimedOrder(tasks: Task[], dayKey: string, movedId: number): number[] {
  const existing = tasks
    .filter((t) => t.occurrence_date === dayKey && t.due_time == null && t.id !== movedId)
    .map((t) => t.id)
  return [...existing, movedId]
}
