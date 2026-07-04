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

  it('fills the whole measured height on overflow (the "+N more" row lives outside it)', () => {
    // capacity = 5, total 10 -> 5 visible, 5 more
    expect(visibleLineCount(10, 80, 16)).toBe(5)
  })

  it('caps one-over-capacity at capacity', () => {
    // capacity = 5, total 6 -> 5 visible, 1 more
    expect(visibleLineCount(6, 80, 16)).toBe(5)
  })

  it('floors fractional capacity', () => {
    // floor(50 / 16) = 3 capacity, total 5 -> 3 visible
    expect(visibleLineCount(5, 50, 16)).toBe(3)
  })

  it('handles a capacity of 1 (very short cell)', () => {
    expect(visibleLineCount(3, 16, 16)).toBe(1)
  })

  it('handles a capacity of 0 (cell shorter than a line)', () => {
    expect(visibleLineCount(3, 10, 16)).toBe(0)
  })

  it('accounts for the row gap between lines', () => {
    // 4 lines of 16px + 3 gaps of 4px = 76px <= 80, a 5th would need +20 -> 96 > 80.
    // Without the gap the naive floor(80/16)=5 would over-count and clip a line.
    expect(visibleLineCount(10, 80, 16, 4)).toBe(4)
  })

  it('treats a gap of 0 like the gapless formula', () => {
    expect(visibleLineCount(10, 80, 16, 0)).toBe(5)
  })
})
