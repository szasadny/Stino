// Shared day grouping: labels follow user order; the unlabeled group is last.
import type { Label, Task } from './types'

/** A label section of a day. `label` is `null` for the trailing "No label" group. */
export interface TaskGroup {
  label: Label | null
  tasks: Task[]
}

/**
 * Partition `tasks` into label sections. Labeled groups are ordered by their
 * label's `sort_order` (then `id`); tasks with no label — or a `label_id` that
 * no longer exists in `labels` — fall into a single "No label" group rendered
 * last. Empty groups are omitted. Input order is preserved within each group.
 */
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

/**
 * One day's tasks in label reading order: timed tasks first, in input order
 * (callers pass the day in the canonical timed-first/time-sorted sort, so timed
 * stay sorted by time regardless of label), then the untimed tasks flattened
 * through `groupByLabel` — label `sort_order`, "No label" last, within-label
 * input (manual `sort_order`) order preserved. Identity for an all-unlabeled
 * day. This is the default cell/day order (see lib/group-view.svelte.ts).
 */
export function labelDayOrder(tasks: Task[], labels: Label[]): Task[] {
  const timed = tasks.filter((t) => t.due_time != null)
  const untimed = tasks.filter((t) => t.due_time == null)
  return [...timed, ...groupByLabel(untimed, labels).flatMap((g) => g.tasks)]
}

/**
 * The day agenda's sections for a given view mode. When `grouped`, the label
 * sections (`groupByLabel`); otherwise a SINGLE unlabeled section holding every task
 * in the given order — the default flat list that reads the same as the month/week
 * cells (callers pass tasks already in the canonical timed-first/`sort_order` sort).
 * Empty input yields no sections either way, so the caller shows its empty state.
 */
export function dayViewGroups(tasks: Task[], labels: Label[], grouped: boolean): TaskGroup[] {
  if (grouped) return groupByLabel(tasks, labels)
  return tasks.length > 0 ? [{ label: null, tasks }] : []
}

/**
 * Index tasks by their `occurrence_date` (`YYYY-MM-DD`) for O(1) per-day lookup
 * in the month and week grids. A recurring task lands on every occurrence day,
 * so the same id can appear under several keys; tasks with no `occurrence_date`
 * (unscheduled) are omitted. Input order is preserved within each day.
 */
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
