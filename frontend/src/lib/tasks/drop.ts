import { TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import type { Label, Task } from '../types'
import { appendedUntimedOrder } from './day-order'
import { applyUntimedOrder } from './optimistic'
import { isRecurring, isUntimed, occurrenceKey } from './predicates'
import { calendarDayOrder, type CellItem } from './projection'

type DropPlan =
  | { kind: 'none' }
  | { kind: 'move'; movedId: number; reorderIds: number[] | null }
  | { kind: 'reorder'; ids: number[] }
  | { kind: 'move-occurrence'; taskId: number; occurrenceDate: string; newDate: string }

const untimedIds = (rows: Task[]): number[] => rows.filter(isUntimed).map((t) => t.id)

// A drop saves only an order the view would show itself; `day` is the whole day in reading order.
export function droppedUntimedOrder(
  dropped: Task[],
  show: (rows: Task[]) => Task[],
  day: Task[] = dropped,
): number[] | null {
  const shown = show(applyUntimedOrder(dropped, untimedIds(dropped))).map(occurrenceKey)
  const kept = dropped.map(occurrenceKey)
  const same = shown.length === kept.length && shown.every((key, i) => key === kept[i])
  return same ? untimedIds(day) : null
}

// Only the LANDING zone commits; a source zone reports a different trigger and yields `none`.
export function dropKind(
  detail: DndEvent<CellItem>,
  destKey: string,
  tasks: Task[],
  labelOrder?: Label[],
): DropPlan {
  if (detail.info.trigger !== TRIGGERS.DROPPED_INTO_ZONE) return { kind: 'none' }
  const task = detail.items.find((it) => it.id === detail.info.id)?.task
  if (!task) return { kind: 'none' }
  if (task.occurrence_date === destKey) {
    const rows = detail.items.map((it) => it.task)
    const ids = droppedUntimedOrder(rows, (day) => calendarDayOrder(day, labelOrder))
    return ids ? { kind: 'reorder', ids } : { kind: 'none' }
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
