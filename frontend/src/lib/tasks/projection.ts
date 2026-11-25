import type { Label, Task } from '../types'
import { isRecurring, isUntimed, occurrenceKey } from './predicates'
import { compareSortOrder, completedLast } from './sort'

export interface TaskGroup {
  label: Label | null // null ⇒ the trailing "No label" group
  tasks: Task[]
}

export interface CellItem {
  id: string
  task: Task
}

// A `label_id` missing from `labels` falls into "No label".
function groupByLabel(tasks: Task[], labels: Label[]): TaskGroup[] {
  const known = new Set(labels.map((l) => l.id))
  const groups: TaskGroup[] = []
  for (const label of [...labels].sort(compareSortOrder)) {
    const inGroup = tasks.filter((t) => t.label_id === label.id)
    if (inGroup.length > 0) groups.push({ label, tasks: inGroup })
  }
  const noLabel = tasks.filter((t) => t.label_id == null || !known.has(t.label_id))
  if (noLabel.length > 0) groups.push({ label: null, tasks: noLabel })
  return groups
}

// Timed tasks keep their time order; only the untimed regroup by label. Expects the server sort.
function labelDayOrder(tasks: Task[], labels: Label[]): Task[] {
  const timed = tasks.filter((t) => !isUntimed(t))
  const untimed = tasks.filter(isUntimed)
  return [...timed, ...groupByLabel(untimed, labels).flatMap((g) => g.tasks)]
}

export function dayViewGroups(tasks: Task[], labels: Label[], grouped: boolean): TaskGroup[] {
  if (grouped) return groupByLabel(tasks, labels)
  return tasks.length > 0 ? [{ label: null, tasks }] : []
}

// Every day key gets an array, so empty days are valid drop targets.
export function buildBoard(
  tasks: Task[],
  dayKeys: string[],
  labelOrder?: Label[],
): Record<string, CellItem[]> {
  const byDay = new Map<string, Task[]>(dayKeys.map((key) => [key, []]))
  for (const task of tasks) {
    if (task.occurrence_date != null) byDay.get(task.occurrence_date)?.push(task)
  }
  const board: Record<string, CellItem[]> = {}
  for (const [key, day] of byDay) {
    const ordered = labelOrder && day.length > 0 ? labelDayOrder(day, labelOrder) : day
    board[key] = completedLast(ordered).map((task) => ({ id: occurrenceKey(task), task }))
  }
  return board
}

// TickTick-style: a missed past occurrence shows only as its rollover copy on today.
export function withoutMissedOccurrences(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !isRecurring(t) || t.completed || (t.occurrence_date ?? '') >= today)
}

// Label sections need at least one task whose label still exists.
export function hasLabelGroups(tasks: Task[], labels: Label[]): boolean {
  const known = new Set(labels.map((l) => l.id))
  return tasks.some((t) => t.label_id != null && known.has(t.label_id))
}
