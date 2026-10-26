import type { Action } from 'svelte/action'
import { DRAGGED_ELEMENT_ID } from 'svelte-dnd-action'

export const EDGE_ZONE_PX = 72
export const MAX_STEP_PX = 14

// Overshoot allowed outside the container while the pointer aims at its edge.
export const OUTSIDE_SLACK_PX = 40

/** Signed px/frame, ramping linearly to `maxStep` at the edge; in a short container the deeper edge wins. */
export function edgeScrollStep(
  pointerY: number,
  top: number,
  bottom: number,
  zone: number = EDGE_ZONE_PX,
  maxStep: number = MAX_STEP_PX,
): number {
  const upDepth = top + zone - pointerY
  const downDepth = pointerY - (bottom - zone)
  if (upDepth <= 0 && downDepth <= 0) return 0
  if (upDepth > downDepth) return -Math.min(upDepth / zone, 1) * maxStep
  return Math.min(downDepth / zone, 1) * maxStep
}

/** True while svelte-dnd-action's floating clone exists — a live drag or a drop still settling. */
export function dragIsLive(): boolean {
  return document.getElementById(DRAGGED_ELEMENT_ID) != null
}

export function pointFrom(
  e: TouchEvent | MouseEvent,
): { clientX: number; clientY: number } | undefined {
  return 'touches' in e ? e.touches[0] : e
}

/** Fires `onDwell` after `holdMs` continuously within `zonePx` of `bottom`; callers must `cancel()` on teardown. */
export function createBottomDwell(zonePx: number, holdMs: number, onDwell: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    move(pointerY: number, bottom: number) {
      const inZone = pointerY > bottom - zonePx
      if (inZone && timer == null) {
        timer = setTimeout(() => {
          timer = undefined
          onDwell()
        }, holdMs)
      } else if (!inZone && timer != null) {
        clearTimeout(timer)
        timer = undefined
      }
    },
    cancel() {
      clearTimeout(timer)
      timer = undefined
    },
  }
}

/** Auto-scrolls the container near its edges during a live drag; inert otherwise. */
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
      pointerY >= rect.top - OUTSIDE_SLACK_PX &&
      pointerY <= rect.bottom + OUTSIDE_SLACK_PX
    if (overContainer) {
      const step = edgeScrollStep(pointerY, rect.top, rect.bottom)
      if (step !== 0) node.scrollBy(0, step)
    }
    raf = requestAnimationFrame(tick)
  }

  function onMove(e: TouchEvent | MouseEvent) {
    const point = pointFrom(e)
    if (!point) return
    pointerX = point.clientX
    pointerY = point.clientY
    if (!raf && dragIsLive()) raf = requestAnimationFrame(tick)
  }

  // Passive: the dnd library owns (and preventDefaults) the touch gesture; we only observe.
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('mousemove', onMove, { passive: true })

  return {
    destroy() {
      cancelAnimationFrame(raf)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mousemove', onMove)
    },
  }
}
