import type { Label, Task } from './types'
import { labelDayOrder } from './grouping'
import { completedLast } from './ordering'

export interface CellItem {
  id: string
  task: Task
}

/** A recurring series repeats its `id` across days; svelte-dnd-action needs unique ids. */
export function cellItemId(task: Task): string {
  return `${task.id}:${task.occurrence_date ?? task.due_date ?? ''}`
}

/** Every day key gets an array, so empty days are valid drop targets. */
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
    board[key] = completedLast(day).map((task) => ({ id: cellItemId(task), task }))
  }
  return board
}

/** The moved task joins the end of the day's untimed order; timed tasks sort by time instead. */
export function appendedUntimedOrder(tasks: Task[], dayKey: string, movedId: number): number[] {
  const existing = tasks
    .filter((t) => t.occurrence_date === dayKey && t.due_time == null && t.id !== movedId)
    .map((t) => t.id)
  return [...existing, movedId]
}
