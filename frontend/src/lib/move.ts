// Pure grid-drag classification and optimistic cross-day moves. Same-day drops reorder;
// cross-day drops reschedule or detach recurring instances.
import { TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { appendedUntimedOrder, type CellItem } from './calendar-board'
import { sortForView } from './ordering'
import type { Task } from './types'

/** What a finalized grid drop should do. `none` = nothing to persist. */
export type DropPlan =
  | { kind: 'none' }
  | { kind: 'move'; movedId: number; reorderIds: number[] | null }
  | { kind: 'reorder'; ids: number[] }
  | { kind: 'move-occurrence'; taskId: number; occurrenceDate: string; newDate: string }

/**
 * Classify a day cell's `finalize` event. Only the LANDING zone commits — a source zone
 * (the item left it) reports a different trigger and yields `none`.
 *
 * SAME-day drop: reorder the cell's untimed tasks (`reorder`), unless the moved pill is
 * timed (pinned by time) or recurring (its instance is fixed to that day) → `none`.
 *
 * ANOTHER-day drop: a recurring task moves only THIS instance off the series
 * (`move-occurrence`); a plain task is a whole `move` (its `due_date` changes), carrying
 * the dest day's untimed order for an untimed task and `reorderIds: null` for a timed one.
 */
export function dropKind(
  e: CustomEvent<DndEvent<CellItem>>,
  destKey: string,
  tasks: Task[],
): DropPlan {
  if (e.detail.info.trigger !== TRIGGERS.DROPPED_INTO_ZONE) return { kind: 'none' }
  const moved = e.detail.items.find((it) => it.id === e.detail.info.id)
  if (!moved) return { kind: 'none' }
  const task = moved.task
  if (task.occurrence_date === destKey) {
    // Reorder within the day — untimed, non-recurring tasks only (timed sort by time, a
    // recurring instance is pinned to its day).
    if (task.due_time != null || task.recurrence_rule != null) return { kind: 'none' }
    const ids = e.detail.items.filter((it) => it.task.due_time == null).map((it) => it.task.id)
    return { kind: 'reorder', ids }
  }
  if (task.recurrence_rule != null) {
    // Detach just the dragged instance; the series keeps repeating elsewhere.
    if (task.occurrence_date == null) return { kind: 'none' }
    return {
      kind: 'move-occurrence',
      taskId: task.id,
      occurrenceDate: task.occurrence_date,
      newDate: destKey,
    }
  }
  const reorderIds = task.due_time == null ? appendedUntimedOrder(tasks, destKey, task.id) : null
  return { kind: 'move', movedId: task.id, reorderIds }
}

/**
 * Apply a cross-day move to `tasks` without a refetch: set the moved task's `due_date` and
 * `occurrence_date` to `destKey`, and (for an untimed task) give it a `sort_order` after the
 * dest day's existing untimed tasks. The result is re-sorted with the same rule the server
 * uses, so the optimistic board renders exactly as a reload would. A recurring or unknown
 * `movedId` is a no-op.
 */
export function applyMove(tasks: Task[], movedId: number, destKey: string): Task[] {
  const moved = tasks.find((t) => t.id === movedId)
  if (!moved || moved.recurrence_rule != null) return tasks
  let sortOrder = moved.sort_order
  if (moved.due_time == null) {
    sortOrder =
      tasks
        .filter((t) => t.id !== movedId && t.occurrence_date === destKey && t.due_time == null)
        .reduce((max, t) => Math.max(max, t.sort_order), -1) + 1
  }
  const updated = tasks.map((t) =>
    t.id === movedId
      ? { ...t, due_date: destKey, occurrence_date: destKey, sort_order: sortOrder }
      : t,
  )
  return sortForView(updated)
}
