// Swallow the duplicate click emitted by svelte-dnd-action after a touch edit. Arm only
// for coarse pointers; mouse clicks must never be swallowed.
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
