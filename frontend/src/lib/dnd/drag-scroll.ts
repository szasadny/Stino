import { EDGE_SCROLL_MAX_STEP_PX, EDGE_SCROLL_ZONE_PX } from '../constants'

interface ClientPoint {
  clientX: number
  clientY: number
}

// Signed px/frame ramping to `maxStep` at the edge; in a short container the deeper edge wins.
export function edgeScrollStep(
  pointerY: number,
  top: number,
  bottom: number,
  zone: number = EDGE_SCROLL_ZONE_PX,
  maxStep: number = EDGE_SCROLL_MAX_STEP_PX,
): number {
  const upDepth = top + zone - pointerY
  const downDepth = pointerY - (bottom - zone)
  if (upDepth <= 0 && downDepth <= 0) return 0
  if (upDepth > downDepth) return -Math.min(upDepth / zone, 1) * maxStep
  return Math.min(downDepth / zone, 1) * maxStep
}

export function pointFrom(
  e: ClientPoint | { touches: ArrayLike<ClientPoint> },
): ClientPoint | undefined {
  return 'touches' in e ? e.touches[0] : e
}

// Fires `onDwell` after `holdMs` continuously within `zonePx` of `bottom`; callers must `cancel()`.
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
