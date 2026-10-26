import type { Action } from 'svelte/action'
import { dragIsLive } from './drag-scroll'

// Horizontal must dominate vertical by SWIPE_RATIO so a diagonal scroll never flips the month.
export const SWIPE_THRESHOLD = 50
export const SWIPE_RATIO = 1.5

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
    // A second touch (pinch) cancels the gesture.
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
    // The phone Week stack is a drag zone AND a swipe surface; a settling drop must not navigate.
    if (dragIsLive()) return
    const t = e.changedTouches[0]
    const dir = swipeDirection(t.clientX - startX, t.clientY - startY)
    if (dir === 'left') opts.onLeft?.()
    else if (dir === 'right') opts.onRight?.()
  }

  // Capture: svelte-dnd-action's row touchstart calls stopPropagation(), so a swipe starting
  // on a draggable row would never bubble here. Passive, so hold-to-drag is untouched.
  const listen = { passive: true, capture: true } as const
  node.addEventListener('touchstart', onStart, listen)
  node.addEventListener('touchend', onEnd, listen)

  return {
    update(next: SwipeOptions) {
      opts = next
    },
    destroy() {
      node.removeEventListener('touchstart', onStart, listen)
      node.removeEventListener('touchend', onEnd, listen)
    },
  }
}
