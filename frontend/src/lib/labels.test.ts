import { describe, expect, it } from 'vitest'
import { applyLabelOrder, labelLookup, mergeLabelOrder, nextPaletteColor } from './labels'
import { LABEL_PALETTE } from './palette.js'
import type { Label, Task } from './types'

const label = (id: number, sort_order = 0): Label => ({
  id,
  name: `L${id}`,
  color: '#000000',
  emoji: null,
  sort_order,
})

const task = (label_id: number | null): Task => ({
  id: 1,
  title: 'T',
  notes: null,
  label_id,
  due_date: null,
  due_time: null,
  recurrence_rule: null,
  occurrence_date: null,
  sort_order: 0,
  completed: false,
})

describe('labelLookup', () => {
  const lookup = labelLookup([label(1), label(2)])

  it('finds the label a task carries', () => {
    expect(lookup(task(2))?.id).toBe(2)
  })

  it('returns undefined for a task with no label', () => {
    expect(lookup(task(null))).toBeUndefined()
  })

  it('returns undefined for a deleted/unknown label id', () => {
    expect(lookup(task(99))).toBeUndefined()
  })
})

describe('mergeLabelOrder', () => {
  // Full order A(1) B(2) C(3) D(4).
  const all = [label(1, 0), label(2, 1), label(3, 2), label(4, 3)]

  it('reorders a visible subset within the slots it occupied, pinning the rest', () => {
    // Day shows B and D; user puts D before B. A and C keep their slots (1 and 3).
    expect(mergeLabelOrder(all, [4, 2])).toEqual([1, 4, 3, 2])
  })

  it('reorders the whole list when every label is visible', () => {
    expect(mergeLabelOrder(all, [3, 1, 4, 2])).toEqual([3, 1, 4, 2])
  })

  it('is a no-op when the visible order is unchanged', () => {
    expect(mergeLabelOrder(all, [2, 4])).toEqual([1, 2, 3, 4])
  })
})

describe('nextPaletteColor', () => {
  it('starts at the first palette color with no labels', () => {
    expect(nextPaletteColor([])).toBe(LABEL_PALETTE[0].hex)
  })

  it('advances by max sort_order, not list length, matching the backend importer', () => {
    // Three labels created (sort orders 0..2), then the middle one deleted: the
    // list has 2 labels but the next sort_order is 3 — length % len would hand
    // out palette[2] again while the importer would pick palette[3].
    const afterDelete = [label(1, 0), label(3, 2)]
    expect(nextPaletteColor(afterDelete)).toBe(LABEL_PALETTE[3].hex)
  })

  it('wraps around when the palette is exhausted', () => {
    expect(nextPaletteColor([label(1, LABEL_PALETTE.length - 1)])).toBe(LABEL_PALETTE[0].hex)
  })
})

describe('applyLabelOrder', () => {
  const all = [label(1, 0), label(2, 1), label(3, 2)]

  it('reorders the labels and renumbers sort_order to the new positions', () => {
    const out = applyLabelOrder(all, [3, 1, 2])
    expect(out.map((l) => l.id)).toEqual([3, 1, 2])
    expect(out.map((l) => l.sort_order)).toEqual([0, 1, 2])
  })

  it('keeps labels missing from ids at the end', () => {
    const out = applyLabelOrder(all, [2])
    expect(out.map((l) => l.id)).toEqual([2, 1, 3])
  })
})
