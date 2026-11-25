import { describe, expect, it } from 'vitest'
import { SWIPE_RATIO, SWIPE_THRESHOLD_PX } from '../constants'
import { swipeDirection } from './swipe'

describe('swipeDirection', () => {
  it('returns null for a short horizontal travel (a tap), either way', () => {
    expect(swipeDirection(SWIPE_THRESHOLD_PX - 1, 0)).toBeNull()
    expect(swipeDirection(-(SWIPE_THRESHOLD_PX - 1), 0)).toBeNull()
  })

  it('reads a clear left/right swipe past the threshold', () => {
    expect(swipeDirection(-120, 5)).toBe('left')
    expect(swipeDirection(120, -5)).toBe('right')
  })

  it('accepts a travel of exactly the threshold', () => {
    expect(swipeDirection(SWIPE_THRESHOLD_PX, 0)).toBe('right')
    expect(swipeDirection(-SWIPE_THRESHOLD_PX, 0)).toBe('left')
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
