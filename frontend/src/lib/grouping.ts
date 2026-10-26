import type { Label, Task } from './types'

/** `label` is null for the trailing "No label" group. */
export interface TaskGroup {
  label: Label | null
  tasks: Task[]
}

/** A `label_id` no longer in `labels` falls into "No label". */
export function groupByLabel(tasks: Task[], labels: Label[]): TaskGroup[] {
  const ordered = [...labels].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const known = new Set(labels.map((l) => l.id))

  const groups: TaskGroup[] = []
  for (const label of ordered) {
    const inGroup = tasks.filter((t) => t.label_id === label.id)
    if (inGroup.length > 0) groups.push({ label, tasks: inGroup })
  }

  const noLabel = tasks.filter((t) => t.label_id == null || !known.has(t.label_id))
  if (noLabel.length > 0) groups.push({ label: null, tasks: noLabel })

  return groups
}

/** Timed tasks keep their time order; only the untimed regroup by label. Expects the server sort. */
export function labelDayOrder(tasks: Task[], labels: Label[]): Task[] {
  const timed = tasks.filter((t) => t.due_time != null)
  const untimed = tasks.filter((t) => t.due_time == null)
  return [...timed, ...groupByLabel(untimed, labels).flatMap((g) => g.tasks)]
}

export function dayViewGroups(tasks: Task[], labels: Label[], grouped: boolean): TaskGroup[] {
  if (grouped) return groupByLabel(tasks, labels)
  return tasks.length > 0 ? [{ label: null, tasks }] : []
}

/** A recurring task's id appears under every occurrence day. */
export function groupByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.occurrence_date) continue
    const list = map.get(task.occurrence_date)
    if (list) list.push(task)
    else map.set(task.occurrence_date, [task])
  }
  return map
}
