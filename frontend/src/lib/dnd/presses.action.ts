import { createPressTracker, type PressTracker } from './tap'

export const presses = createPressTracker()

export function trackPresses(target: Window, tracker: PressTracker): void {
  const opts = { capture: true, passive: true }
  const point = (e: PointerEvent) => ({ pointerId: e.pointerId, x: e.clientX, y: e.clientY })
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
