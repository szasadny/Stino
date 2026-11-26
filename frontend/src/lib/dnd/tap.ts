import { SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { TAP_SLOP_PX } from '../constants'

interface PressPoint {
  pointerId: number
  x: number
  y: number
}

// svelte-dnd-action re-dispatches a tap as an untrusted click before the browser's own.
export function trustedClick(handler: () => void): (e: { isTrusted: boolean }) => void {
  return (e) => {
    if (e.isTrusted) handler()
  }
}

interface CellClick {
  isTrusted: boolean
  onControl: boolean
  dragging: boolean
  stationary: boolean
}

// A press that travelled was a drag or a text selection, not a click on the cell.
export function opensFromEmptySpace(click: CellClick): boolean {
  return click.isTrusted && !click.onControl && !click.dragging && click.stationary
}

// Enter/Space on a `role="button"` surface (svelte-dnd-action can't drag a native button).
export function activateOnKey(
  handler: () => void,
): (e: { key: string; preventDefault(): void }) => void {
  return (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    handler()
  }
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

// A touch press outlasting `delayTouchStart` becomes a drag even if it never moved; that's a tap.
export function tappedItem<T extends { id: unknown }>(
  detail: DndEvent<T>,
  stationary: boolean,
): T | undefined {
  const { trigger, source, id } = detail.info
  if (!stationary || trigger !== TRIGGERS.DROPPED_INTO_ZONE || source !== SOURCES.POINTER) return
  return detail.items.find((it) => String(it.id) === String(id))
}
