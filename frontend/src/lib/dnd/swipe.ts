import { SWIPE_RATIO, SWIPE_THRESHOLD_PX } from '../constants'

export function swipeDirection(dx: number, dy: number): 'left' | 'right' | null {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null
  return dx < 0 ? 'left' : 'right'
}
