import { TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { appendedUntimedOrder, type CellItem } from './calendar-board'
import { sortForView } from './ordering'
import type { Task } from './types'

export type DropPlan =
  | { kind: 'none' }
  | { kind: 'move'; movedId: number; reorderIds: number[] | null }
  | { kind: 'reorder'; ids: number[] }
  | { kind: 'move-occurrence'; taskId: number; occurrenceDate: string; newDate: string }

/** Only the LANDING zone commits; a source zone reports a different trigger and yields `none`. */
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
    // Timed tasks sort by time; a recurring instance is pinned to its day.
    if (task.due_time != null || task.recurrence_rule != null) return { kind: 'none' }
    const ids = e.detail.items.filter((it) => it.task.due_time == null).map((it) => it.task.id)
    return { kind: 'reorder', ids }
  }
  if (task.recurrence_rule != null) {
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

/** Optimistic cross-day move; an untimed task joins the end of the dest day. */
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
