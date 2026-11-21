// svelte-dnd-action turns a touch press that outlasts `delayTouchStart` into a drag even if the
// finger never moves, and re-dispatches a tap as an untrusted click before the browser's own.
import { SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { TAP_SLOP_PX } from './constants'

export function trustedClick(handler: () => void): (e: Event) => void {
  return (e) => {
    if (e.isTrusted) handler()
  }
}

interface PressPoint {
  pointerId: number
  x: number
  y: number
}

export type PressTracker = ReturnType<typeof createPressTracker>

export function createPressTracker() {
  let start: PressPoint | null = null
  let travel = Infinity
  return {
    down(p: PressPoint) {
      start = p
      travel = 0
    },
    move(p: PressPoint) {
      if (start?.pointerId !== p.pointerId) return
      travel = Math.max(travel, Math.hypot(p.x - start.x, p.y - start.y))
    },
    // Touch events keep flowing after the browser cancels the pointer (e.g. it took a long press).
    touchMove(x: number, y: number) {
      if (start) travel = Math.max(travel, Math.hypot(x - start.x, y - start.y))
    },
    get stationary() {
      return travel < TAP_SLOP_PX
    },
  }
}

export const presses = createPressTracker()

export function trackPresses(target: Window, tracker: PressTracker): void {
  const opts = { capture: true, passive: true }
  const point = (e: PointerEvent): PressPoint => ({
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
  })
  target.addEventListener('pointerdown', (e) => tracker.down(point(e)), opts)
  target.addEventListener('pointermove', (e) => tracker.move(point(e)), opts)
  target.addEventListener('pointerup', (e) => tracker.move(point(e)), opts)
  target.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0]
      if (t) tracker.touchMove(t.clientX, t.clientY)
    },
    opts,
  )
}

/** The dropped item when the drop was really a tap: a pointer press that never left the slop. */
export function tappedItem<T extends { id: unknown }>(
  detail: DndEvent<T>,
  stationary: boolean,
): T | undefined {
  const { trigger, source, id } = detail.info
  if (!stationary || trigger !== TRIGGERS.DROPPED_INTO_ZONE || source !== SOURCES.POINTER) return
  return detail.items.find((it) => String(it.id) === String(id))
}
