import type { Action } from 'svelte/action'
import { dragIsLive } from './drag-scroll.action'
import { swipeDirection } from './swipe'

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
    const touch = e.touches[0]
    // A second touch (pinch) cancels the gesture.
    if (e.touches.length !== 1 || !touch) {
      tracking = false
      return
    }
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
  }

  function onEnd(e: TouchEvent) {
    if (!tracking) return
    tracking = false
    // The phone Week stack is a drag zone AND a swipe surface; a settling drop must not navigate.
    if (dragIsLive()) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const dir = swipeDirection(touch.clientX - startX, touch.clientY - startY)
    if (dir === 'left') opts.onLeft?.()
    else if (dir === 'right') opts.onRight?.()
  }

  // Capture: svelte-dnd-action's row touchstart stops propagation; passive keeps hold-to-drag intact.
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
