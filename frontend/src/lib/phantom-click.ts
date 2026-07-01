// Open an editor from a hold-to-drag row while swallowing the ONE stray "compatibility"
// click a touch tap leaves behind. On svelte-dnd-action's `delayTouchStart` path a tap
// emits two clicks a beat apart — the library dispatches its own synthetic tap→click AND
// the browser still fires the native one. The row's tap opens an editor in place, so that
// second click would land on whatever just mounted at the tap point (a field, Save/Delete,
// or a light-dismiss backdrop). A one-shot capturing listener eats the next click, then
// disarms — on that click or after a short window — so it can never eat a later,
// intentional click.
//
// It arms ONLY on a touch-primary device (`pointer: coarse`). On a fine pointer — a mouse,
// including a narrow desktop window that still uses the compact layout — there is no
// phantom, so arming the buster would instead eat the user's next real click; there we
// just open directly. Kept in one place so DayAgenda and DayListSection can't drift.
import { GHOST_CLICK_WINDOW_MS } from './constants'

export function openWithoutPhantomClick(open: () => void): void {
  // No phantom without a touch tap — a mouse click that opens the editor is safe on its own.
  if (!window.matchMedia('(pointer: coarse)').matches) {
    open()
    return
  }
  let timer: ReturnType<typeof setTimeout>
  const disarm = () => {
    window.removeEventListener('click', bust, true)
    clearTimeout(timer)
  }
  const bust = (e: MouseEvent) => {
    e.stopImmediatePropagation()
    e.preventDefault()
    disarm()
  }
  window.addEventListener('click', bust, true)
  timer = setTimeout(disarm, GHOST_CLICK_WINDOW_MS)
  open()
}
