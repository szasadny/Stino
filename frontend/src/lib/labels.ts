import { LABEL_PALETTE, type PaletteHex } from './palette'
import type { Label, Task } from './types'

// Mirrors the backend importer; keyed off sort_order (not length) so both agree after a delete.
export function nextPaletteColor(labels: Pick<Label, 'sort_order'>[]): PaletteHex {
  const next = labels.reduce((max, l) => Math.max(max, l.sort_order), -1) + 1
  return (LABEL_PALETTE[next % LABEL_PALETTE.length] ?? LABEL_PALETTE[0]).hex
}

// Feeds the `.label-tint`/`.label-dot` classes in app.css.
export function labelColorVar(color: string | null | undefined): string {
  return color ? `--label:${color}` : ''
}

export function labelTint(
  color: string | null | undefined,
  fallbackClass: string,
): { class: string; style: string } {
  return color
    ? { class: 'label-tint', style: labelColorVar(color) }
    : { class: fallbackClass, style: '' }
}

// Builds an index per call, so derive it from reactive `labels`; a deleted label reads as none.
export function labelLookup(labels: Label[]): (task: Task) => Label | undefined {
  const index = new Map(labels.map((l) => [l.id, l]))
  return (task) => (task.label_id == null ? undefined : index.get(task.label_id))
}

export function findLabelByName(labels: Label[], name: string): Label | undefined {
  const wanted = name.trim().toLowerCase()
  return labels.find((l) => l.name.toLowerCase() === wanted)
}

// `sort_order` is global, so hidden labels keep their slots and the visible ones refill theirs.
export function mergeLabelOrder(allLabels: Label[], visibleOrder: number[]): number[] {
  const visible = new Set(visibleOrder)
  const queue = [...visibleOrder]
  return allLabels.map((l) => (visible.has(l.id) ? (queue.shift() ?? l.id) : l.id))
}

// Swaps the id at `index` with its neighbour; null when that would leave the list.
export function moveId(ids: number[], index: number, delta: -1 | 1): number[] | null {
  const moving = ids[index]
  const displaced = ids[index + delta]
  if (moving === undefined || displaced === undefined) return null
  const next = [...ids]
  next[index] = displaced
  next[index + delta] = moving
  return next
}
