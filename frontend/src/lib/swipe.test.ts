import { describe, expect, it } from 'vitest'
import { SWIPE_RATIO, SWIPE_THRESHOLD, swipeDirection } from './swipe'

describe('swipeDirection', () => {
  it('returns null for a short horizontal travel (a tap)', () => {
    expect(swipeDirection(SWIPE_THRESHOLD - 1, 0)).toBeNull()
    expect(swipeDirection(-(SWIPE_THRESHOLD - 1), 0)).toBeNull()
  })

  it('reads a clear left/right swipe past the threshold', () => {
    expect(swipeDirection(-120, 5)).toBe('left')
    expect(swipeDirection(120, -5)).toBe('right')
  })

  it('rejects just under the threshold, accepts at and past it', () => {
    expect(swipeDirection(SWIPE_THRESHOLD - 1, 0)).toBeNull()
    expect(swipeDirection(SWIPE_THRESHOLD, 0)).toBe('right')
  })

  it('ignores a mostly-vertical drag so scrolling never flips the month', () => {
    expect(swipeDirection(60, 120)).toBeNull()
  })

  it('fires when horizontal dominates vertical by the ratio', () => {
    const dx = 100
    expect(swipeDirection(dx, dx / SWIPE_RATIO - 1)).toBe('right')
    expect(swipeDirection(dx, dx / SWIPE_RATIO + 1)).toBeNull()
  })
})
