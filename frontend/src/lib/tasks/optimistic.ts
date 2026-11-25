import type { Label, Task } from '../types'
import { appendedUntimedOrder } from './day-order'
import { isRecurring, isUntimed, sameOccurrence } from './predicates'
import { sortForView } from './sort'

export function applyUntimedOrder(tasks: Task[], ids: number[]): Task[] {
  const rank = new Map(ids.map((id, index) => [id, index]))
  const patched = tasks.map((t) => {
    const sortOrder = rank.get(t.id)
    return isUntimed(t) && sortOrder !== undefined ? { ...t, sort_order: sortOrder } : t
  })
  return sortForView(patched)
}

// Mirrors the server: the date write, then (if untimed) the dest day's appended order.
export function applyMove(tasks: Task[], movedId: number, destKey: string): Task[] {
  const moved = tasks.find((t) => t.id === movedId)
  if (!moved || isRecurring(moved)) return tasks
  const order = isUntimed(moved) ? appendedUntimedOrder(tasks, destKey, movedId) : []
  const dated = tasks.map((t) =>
    t.id === movedId ? { ...t, due_date: destKey, occurrence_date: destKey } : t,
  )
  return applyUntimedOrder(dated, order)
}

// Labels missing from `ids` go last.
export function applyLabelOrder(labels: Label[], ids: number[]): Label[] {
  const byId = new Map(labels.map((l) => [l.id, l]))
  const ordered = ids.map((id) => byId.get(id)).filter((l): l is Label => l != null)
  const placed = new Set(ordered.map((l) => l.id))
  const rest = labels.filter((l) => !placed.has(l.id))
  return [...ordered, ...rest].map((l, i) => ({ ...l, sort_order: i }))
}

export function replaceOccurrence(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) => (sameOccurrence(t, updated) ? updated : t))
}

export function withoutTasks(tasks: Task[], ids: Iterable<number>): Task[] {
  const drop = new Set(ids)
  return tasks.filter((t) => !drop.has(t.id))
}

export function withoutOccurrence(tasks: Task[], id: number, occurrenceDate: string): Task[] {
  return tasks.filter((t) => !sameOccurrence(t, { id, occurrence_date: occurrenceDate }))
}

// Replaces in place if a reload already brought it back.
export function restoreOccurrence(tasks: Task[], task: Task, index: number): Task[] {
  if (tasks.some((t) => sameOccurrence(t, task))) return replaceOccurrence(tasks, task)
  const at = Math.max(0, Math.min(index, tasks.length))
  return [...tasks.slice(0, at), task, ...tasks.slice(at)]
}
