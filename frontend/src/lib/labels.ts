// Label lookup shared by the views that decorate task rows with their label
// (Inbox / Month / Week / Search), so the id→label map and the "no label / a
// deleted label" handling live in one place.
import { LABEL_PALETTE } from './palette.js'
import type { Label, Task } from './types'

/**
 * The palette color for the NEXT label to create, matching the backend importer's
 * convention: `(max sort_order + 1) % palette length` (see `next_sort_order` +
 * `create_label` in the backend). Keyed off sort_order, not list length, so the
 * client and the importer keep assigning the same colors after a label delete.
 */
export function nextPaletteColor(labels: Pick<Label, 'sort_order'>[]): string {
  const next = labels.reduce((max, l) => Math.max(max, l.sort_order), -1) + 1
  return LABEL_PALETTE[next % LABEL_PALETTE.length].hex
}

// Soft label-colour wash (~25%) used as the BACKGROUND wherever a task shows its label
// colour as a pill/row — the calendar pills (TaskPill), the phone month cell lines, and
// the day/inbox task rows (TaskRow). One source so every surface tints identically. `40`
// is the 8-digit-hex alpha byte (~25%): enough colour to read the label at a glance while
// the themed `ink` title stays legible over it on the light OR dark ground (same safe
// approach as LabelChip — no per-component `dark:` classes).
export const LABEL_TINT_ALPHA = '40'

/** Inline `background-color` style for a label colour, or `''` when unlabelled (the caller
 * then falls back to a neutral background). Keeps the tint recipe in exactly one place. */
export function labelTint(color: string | null | undefined): string {
  return color ? `background-color:${color}${LABEL_TINT_ALPHA}` : ''
}

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

/**
 * Fold a reordering of a *subset* of labels back into the full label order. The
 * grouped day view only shows sections for labels that have tasks that day, so a
 * drag there reorders just those visible labels — but `sort_order` is global. We
 * keep every other label pinned in its current slot and drop the reordered visible
 * labels into the slots they collectively occupied, in their new order.
 * `allLabels` is the full list in current (sort_order) order; `visibleOrder` is the
 * new order of the visible label ids. Returns the full id order for
 * `api.labels.reorder`.
 */
export function mergeLabelOrder(allLabels: Label[], visibleOrder: number[]): number[] {
  const visible = new Set(visibleOrder)
  const queue = [...visibleOrder]
  return allLabels.map((l) => (visible.has(l.id) ? (queue.shift() as number) : l.id))
}

/**
 * Reorder `labels` to match the id sequence `ids`, patching each `sort_order` to
 * its new index so a re-group (which sorts by `sort_order`) reflects it at once —
 * the optimistic mirror of `api.labels.reorder`. Ids not in `labels` are skipped;
 * any labels missing from `ids` keep their relative order at the end.
 */
export function applyLabelOrder(labels: Label[], ids: number[]): Label[] {
  const byId = new Map(labels.map((l) => [l.id, l]))
  const ordered = ids.map((id) => byId.get(id)).filter((l): l is Label => l != null)
  const placed = new Set(ordered.map((l) => l.id))
  const rest = labels.filter((l) => !placed.has(l.id))
  return [...ordered, ...rest].map((l, i) => ({ ...l, sort_order: i }))
}
