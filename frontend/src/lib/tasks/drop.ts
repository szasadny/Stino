import { TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import type { Task } from '../types'
import { appendedUntimedOrder } from './day-order'
import { isRecurring, isUntimed } from './predicates'
import type { CellItem } from './projection'

type DropPlan =
  | { kind: 'none' }
  | { kind: 'move'; movedId: number; reorderIds: number[] | null }
  | { kind: 'reorder'; ids: number[] }
  | { kind: 'move-occurrence'; taskId: number; occurrenceDate: string; newDate: string }

// Only the LANDING zone commits; a source zone reports a different trigger and yields `none`.
export function dropKind(detail: DndEvent<CellItem>, destKey: string, tasks: Task[]): DropPlan {
  if (detail.info.trigger !== TRIGGERS.DROPPED_INTO_ZONE) return { kind: 'none' }
  const task = detail.items.find((it) => it.id === detail.info.id)?.task
  if (!task) return { kind: 'none' }
  if (task.occurrence_date === destKey) {
    // Timed tasks sort by time; a recurring instance is pinned to its day.
    if (!isUntimed(task) || isRecurring(task)) return { kind: 'none' }
    const ids = detail.items.filter((it) => isUntimed(it.task)).map((it) => it.task.id)
    return { kind: 'reorder', ids }
  }
  if (isRecurring(task)) {
    if (task.occurrence_date == null) return { kind: 'none' }
    return {
      kind: 'move-occurrence',
      taskId: task.id,
      occurrenceDate: task.occurrence_date,
      newDate: destKey,
    }
  }
  const reorderIds = isUntimed(task) ? appendedUntimedOrder(tasks, destKey, task.id) : null
  return { kind: 'move', movedId: task.id, reorderIds }
}
