// Edge auto-scroll for dnd gestures. The pure `edgeScrollStep` calculation is
// unit-tested; the action only wires pointer events and rAF updates.
import type { Action } from 'svelte/action'
import { DRAGGED_ELEMENT_ID } from 'svelte-dnd-action'

// How far from the container's top/bottom edge the scroll zone starts, and the
// fastest per-frame scroll step (reached at/past the edge itself).
export const EDGE_ZONE_PX = 72
export const MAX_STEP_PX = 14

// Allow a small overshoot outside the container while the pointer aims at its edge.
export const OUTSIDE_SLACK_PX = 40

/**
 * Signed scroll step (px per frame) for a pointer at `pointerY` over a container
 * spanning `top`..`bottom`: negative scrolls up, positive scrolls down, `0` means
 * the pointer is in the middle (no scrolling). Speed ramps linearly from 0 at the
 * zone's inner boundary to `maxStep` at the edge, and clamps at `maxStep` past it.
 * If the container is shorter than two zones the deeper-penetrated edge wins.
 */
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

/**
 * True while svelte-dnd-action's floating dragged clone exists — a live drag, or a
 * drop still settling. The one place the "is a drag in progress" probe lives.
 */
export function dragIsLive(): boolean {
  return document.getElementById(DRAGGED_ELEMENT_ID) != null
}

/** The point a move event describes: the first touch, or the mouse position itself. */
export function pointFrom(
  e: TouchEvent | MouseEvent,
): { clientX: number; clientY: number } | undefined {
  return 'touches' in e ? e.touches[0] : e
}

/**
 * Dwell detector for a strip along the bottom edge: feed it pointer positions and
 * it fires `onDwell` once the pointer has stayed within `zonePx` of `bottom`
 * (strictly past `bottom - zonePx`) for `holdMs` continuously. Leaving the strip
 * before the hold elapses cancels the pending fire; re-entering restarts it from
 * zero. Pure timer/state logic — callers own the event wiring (see MonthView's
 * grid-expand) and must `cancel()` on teardown.
 */
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

/**
 * Attach to a scrollable container: while a svelte-dnd-action drag is live and the
 * pointer is held near the container's top/bottom edge, the container auto-scrolls
 * so the drag can reach content that is off-screen. Inert whenever no drag is in
 * progress (detected by the library's floating dragged element), so it never
 * interferes with normal scrolling or taps.
 */
export const dragEdgeScroll: Action<HTMLElement> = (node) => {
  let raf = 0
  let pointerX = 0
  let pointerY = 0

  function tick() {
    raf = 0
    // The drag ended (or never was) — stop; the next move restarts the loop.
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

  // Passive window listeners: the dnd library owns (and preventDefaults) the touch
  // gesture; we only observe positions, so we can never block or delay it.
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
