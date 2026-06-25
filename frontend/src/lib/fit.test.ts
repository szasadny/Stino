import { describe, it, expect } from 'vitest'
import { visibleLineCount } from './fit'

describe('visibleLineCount', () => {
  it('shows nothing when there are no items', () => {
    expect(visibleLineCount(0, 100, 16)).toBe(0)
  })

  it('shows all while unmeasured (height or line height not yet known)', () => {
    expect(visibleLineCount(8, 0, 16)).toBe(8)
    expect(visibleLineCount(8, 100, 0)).toBe(8)
  })

  it('shows all when everything fits exactly', () => {
    // capacity = floor(80 / 16) = 5 >= 5
    expect(visibleLineCount(5, 80, 16)).toBe(5)
  })

  it('shows all when capacity exceeds the item count', () => {
    expect(visibleLineCount(3, 80, 16)).toBe(3)
  })

  it('reserves one row for "+N more" when it overflows', () => {
    // capacity = 5, total 10 -> 4 visible, 6 more
    expect(visibleLineCount(10, 80, 16)).toBe(4)
  })

  it('treats one-over-capacity as overflow (reserve a row)', () => {
    // capacity = 5, total 6 -> 4 visible, 2 more
    expect(visibleLineCount(6, 80, 16)).toBe(4)
  })

  it('floors fractional capacity', () => {
    // floor(50 / 16) = 3 capacity, total 5 -> overflow -> 2 visible
    expect(visibleLineCount(5, 50, 16)).toBe(2)
  })

  it('handles a capacity of 1 (very short cell)', () => {
    // capacity = 1, total 3 -> max(0, 0) = 0 visible (all roll into "+N more")
    expect(visibleLineCount(3, 16, 16)).toBe(0)
  })

  it('handles a capacity of 0 (cell shorter than a line)', () => {
    expect(visibleLineCount(3, 10, 16)).toBe(0)
  })
})
