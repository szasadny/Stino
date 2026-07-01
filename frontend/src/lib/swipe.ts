// Horizontal-swipe gesture for the phone month grid (swipe left ⇒ next month,
// right ⇒ previous). The decision — is this drag a real horizontal swipe, and
// which way — is pure math (`swipeDirection`), kept separate and unit-tested; the
// `swipe` Svelte action is just the thin touch-event plumbing around it. Touch-only:
// it never fires for a mouse/trackpad, so desktop (which navigates via the header
// arrows and has drag-and-drop on cells) is untouched.
import type { Action } from 'svelte/action'

// Minimum horizontal travel (px) to count as a swipe rather than a tap, and how much
// horizontal must dominate vertical so a diagonal scroll never flips the month.
export const SWIPE_THRESHOLD = 50
export const SWIPE_RATIO = 1.5

/**
 * Classify a touch gesture from its total delta. Returns 'left'/'right' only when the
 * horizontal travel clears `SWIPE_THRESHOLD` and dominates the vertical travel by
 * `SWIPE_RATIO` (so vertical scrolls and taps yield `null`).
 */
export function swipeDirection(dx: number, dy: number): 'left' | 'right' | null {
  if (Math.abs(dx) < SWIPE_THRESHOLD) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null
  return dx < 0 ? 'left' : 'right'
}

interface SwipeOptions {
  onLeft?: () => void
  onRight?: () => void
}

export const swipe: Action<HTMLElement, SwipeOptions> = (node, options) => {
  let opts = options
  let startX = 0
  let startY = 0
  let tracking = false

  function onStart(e: TouchEvent) {
    // Single-finger only; a second touch (pinch) cancels the gesture.
    if (e.touches.length !== 1) {
      tracking = false
      return
    }
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    tracking = true
  }

  function onEnd(e: TouchEvent) {
    if (!tracking) return
    tracking = false
    const t = e.changedTouches[0]
    const dir = swipeDirection(t.clientX - startX, t.clientY - startY)
    if (dir === 'left') opts.onLeft?.()
    else if (dir === 'right') opts.onRight?.()
  }

  node.addEventListener('touchstart', onStart, { passive: true })
  node.addEventListener('touchend', onEnd, { passive: true })

  return {
    update(next: SwipeOptions) {
      opts = next
    },
    destroy() {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchend', onEnd)
    },
  }
}
