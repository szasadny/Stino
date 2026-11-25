import type { Action } from 'svelte/action'
import { DRAGGED_ELEMENT_ID } from 'svelte-dnd-action'
import { EDGE_SCROLL_SLACK_PX } from '../constants'
import { edgeScrollStep, pointFrom } from './drag-scroll'

// True while svelte-dnd-action's floating clone exists: a live drag or a drop still settling.
export function dragIsLive(): boolean {
  return document.getElementById(DRAGGED_ELEMENT_ID) != null
}

// Passive: the dnd library owns (and preventDefaults) the touch gesture; we only observe.
export function trackPointer(onMove: (point: { clientX: number; clientY: number }) => void) {
  const listener = (e: TouchEvent | MouseEvent) => {
    const point = pointFrom(e)
    if (point) onMove(point)
  }
  window.addEventListener('touchmove', listener, { passive: true })
  window.addEventListener('mousemove', listener, { passive: true })
  return () => {
    window.removeEventListener('touchmove', listener)
    window.removeEventListener('mousemove', listener)
  }
}

export const dragEdgeScroll: Action<HTMLElement> = (node) => {
  let raf = 0
  let pointerX = 0
  let pointerY = 0

  function tick() {
    raf = 0
    if (!dragIsLive()) return
    const rect = node.getBoundingClientRect()
    const overContainer =
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top - EDGE_SCROLL_SLACK_PX &&
      pointerY <= rect.bottom + EDGE_SCROLL_SLACK_PX
    if (overContainer) {
      const step = edgeScrollStep(pointerY, rect.top, rect.bottom)
      if (step !== 0) node.scrollBy(0, step)
    }
    raf = requestAnimationFrame(tick)
  }

  const stop = trackPointer((point) => {
    pointerX = point.clientX
    pointerY = point.clientY
    if (!raf && dragIsLive()) raf = requestAnimationFrame(tick)
  })

  return {
    destroy() {
      cancelAnimationFrame(raf)
      stop()
    },
  }
}
