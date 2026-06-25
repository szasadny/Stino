// Label lookup shared by the views that decorate task rows with their label
// (Inbox / Month / Week / Search), so the id→label map and the "no label / a
// deleted label" handling live in one place.
import type { Label, Task } from './types'

/**
 * Build a `(task) => label | undefined` lookup over `labels`. Returns
 * `undefined` for a task with no label or one whose `label_id` is no longer in
 * `labels` (e.g. the label was deleted). The id index is built once per call, so
 * derive it from the reactive `labels` list.
 */
export function labelLookup(labels: Label[]): (task: Task) => Label | undefined {
  const index = new Map(labels.map((l) => [l.id, l]))
  return (task) => (task.label_id == null ? undefined : index.get(task.label_id))
}
