import { LABEL_PALETTE } from './palette.js'
import type { Label, Task } from './types'

/** Mirrors the backend importer; keyed off sort_order (not length) so both agree after a delete. */
export function nextPaletteColor(labels: Pick<Label, 'sort_order'>[]): string {
  const next = labels.reduce((max, l) => Math.max(max, l.sort_order), -1) + 1
  return LABEL_PALETTE[next % LABEL_PALETTE.length].hex
}

/** Feeds the `.label-tint`/`.label-dot` classes in app.css. */
export function labelColorVar(color: string | null | undefined): string {
  return color ? `--label:${color}` : ''
}

/** Undefined for a deleted label too. Builds an index per call — derive it from reactive `labels`. */
export function labelLookup(labels: Label[]): (task: Task) => Label | undefined {
  const index = new Map(labels.map((l) => [l.id, l]))
  return (task) => (task.label_id == null ? undefined : index.get(task.label_id))
}

/**
 * A day view reorders only its visible labels, but `sort_order` is global: hidden labels
 * stay pinned and the visible ones fill the slots they occupied, in their new order.
 */
export function mergeLabelOrder(allLabels: Label[], visibleOrder: number[]): number[] {
  const visible = new Set(visibleOrder)
  const queue = [...visibleOrder]
  return allLabels.map((l) => (visible.has(l.id) ? (queue.shift() as number) : l.id))
}

/** Optimistic mirror of `api.labels.reorder`; labels missing from `ids` go last. */
export function applyLabelOrder(labels: Label[], ids: number[]): Label[] {
  const byId = new Map(labels.map((l) => [l.id, l]))
  const ordered = ids.map((id) => byId.get(id)).filter((l): l is Label => l != null)
  const placed = new Set(ordered.map((l) => l.id))
  const rest = labels.filter((l) => !placed.has(l.id))
  return [...ordered, ...rest].map((l, i) => ({ ...l, sort_order: i }))
}
