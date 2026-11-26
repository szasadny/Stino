import { describe, expect, it } from 'vitest'
import {
  findLabelByName,
  labelColorVar,
  labelLookup,
  labelTint,
  mergeLabelOrder,
  moveId,
  nextPaletteColor,
} from './labels'
import { LABEL_PALETTE } from './palette'
import { makeLabel, makeTask } from './test/factories'

describe('labelLookup', () => {
  const lookup = labelLookup([makeLabel({ id: 1 }), makeLabel({ id: 2 })])

  it('finds the label a task carries', () => {
    expect(lookup(makeTask({ label_id: 2 }))?.id).toBe(2)
  })

  it('returns undefined for a task with no label', () => {
    expect(lookup(makeTask({ label_id: null }))).toBeUndefined()
  })

  it('returns undefined for a deleted/unknown label id', () => {
    expect(lookup(makeTask({ label_id: 99 }))).toBeUndefined()
  })
})

describe('mergeLabelOrder', () => {
  const all = [1, 2, 3, 4].map((id) => makeLabel({ id, sort_order: id - 1 }))

  it('reorders a visible subset within the slots it occupied, pinning the rest', () => {
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
    const afterDelete = [makeLabel({ id: 1, sort_order: 0 }), makeLabel({ id: 3, sort_order: 2 })]
    expect(nextPaletteColor(afterDelete)).toBe(LABEL_PALETTE[3].hex)
  })

  it('wraps around when the palette is exhausted', () => {
    expect(nextPaletteColor([makeLabel({ sort_order: LABEL_PALETTE.length - 1 })])).toBe(
      LABEL_PALETTE[0].hex,
    )
  })
})

describe('labelColorVar', () => {
  it('sets the --label variable only when there is a color', () => {
    expect(labelColorVar(LABEL_PALETTE[1].hex)).toBe(`--label:${LABEL_PALETTE[1].hex}`)
    expect(labelColorVar(null)).toBe('')
    expect(labelColorVar(undefined)).toBe('')
  })
})

describe('labelTint', () => {
  it('tints with the label colour when there is one', () => {
    const hex = LABEL_PALETTE[2].hex
    expect(labelTint(hex, 'bg-surface')).toEqual({ class: 'label-tint', style: `--label:${hex}` })
  })

  it('falls back to the given class without a colour', () => {
    expect(labelTint(null, 'bg-surface')).toEqual({ class: 'bg-surface', style: '' })
    expect(labelTint(undefined, 'bg-pine/10')).toEqual({ class: 'bg-pine/10', style: '' })
  })
})

describe('findLabelByName', () => {
  const labels = [makeLabel({ id: 1, name: 'Home' }), makeLabel({ id: 2, name: 'Work' })]

  it.each([
    ['Home', 1],
    ['  work ', 2],
    ['HOME', 1],
  ])('matches %j case-insensitively after trimming', (name, id) => {
    expect(findLabelByName(labels, name)?.id).toBe(id)
  })

  it('returns undefined for an unknown name', () => {
    expect(findLabelByName(labels, 'Gym')).toBeUndefined()
  })
})

describe('moveId', () => {
  it('swaps the id with its neighbour in either direction', () => {
    expect(moveId([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(moveId([1, 2, 3], 2, -1)).toEqual([1, 3, 2])
  })

  it('refuses to move past either end', () => {
    expect(moveId([1, 2], 0, -1)).toBeNull()
    expect(moveId([1, 2], 1, 1)).toBeNull()
  })
})
