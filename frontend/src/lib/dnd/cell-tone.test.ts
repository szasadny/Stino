import { describe, expect, it } from 'vitest'
import { OPEN_CELL_CLASS, TODAY_CELL_CLASS } from '../constants'
import { dayCellToneClass } from './cell-tone'

describe('dayCellToneClass', () => {
  it.each([
    [true, true, TODAY_CELL_CLASS],
    [true, false, TODAY_CELL_CLASS],
    [false, true, 'border-lichen bg-cell'],
    [false, false, 'border-lichen/70 bg-cell-out'],
  ])('today=%s inMonth=%s → %s', (isToday, inMonth, tone) => {
    expect(dayCellToneClass(isToday, inMonth, false)).toBe(tone)
  })

  it('adds the open ring on top of the tone', () => {
    expect(dayCellToneClass(false, true, true)).toBe(`border-lichen bg-cell ${OPEN_CELL_CLASS}`)
  })
})
