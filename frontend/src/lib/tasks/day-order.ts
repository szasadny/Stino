import type { Task } from '../types'
import { isUntimed } from './predicates'

// True when `ids` already follow sort_order, so a drop back in place saves nothing.
export function isUntimedOrder(tasks: Task[], ids: number[]): boolean {
  const rank = new Map(tasks.map((t) => [t.id, t.sort_order]))
  return ids.every((id, i) => {
    const prev = ids[i - 1]
    return prev === undefined || (rank.get(prev) ?? NaN) < (rank.get(id) ?? NaN)
  })
}

// The moved task joins the end of the day's untimed order; timed tasks sort by time instead.
export function appendedUntimedOrder(tasks: Task[], dayKey: string, movedId: number): number[] {
  const existing = tasks
    .filter((t) => t.occurrence_date === dayKey && isUntimed(t) && t.id !== movedId)
    .map((t) => t.id)
  return [...existing, movedId]
}
