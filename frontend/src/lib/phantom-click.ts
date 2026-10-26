// svelte-dnd-action emits a duplicate click (and mousedown, which would focus the control
// under the finger) after a touch tap; swallow both. Mouse clicks must never be swallowed.
import { GHOST_CLICK_WINDOW_MS } from './constants'

export function openWithoutPhantomClick(open: () => void): void {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    open()
    return
  }
  let timer: ReturnType<typeof setTimeout>
  const disarm = () => {
    window.removeEventListener('mousedown', swallow, true)
    window.removeEventListener('click', bust, true)
    clearTimeout(timer)
  }
  const swallow = (e: MouseEvent) => {
    e.stopImmediatePropagation()
    e.preventDefault()
  }
  const bust = (e: MouseEvent) => {
    swallow(e)
    disarm()
  }
  window.addEventListener('mousedown', swallow, true)
  window.addEventListener('click', bust, true)
  timer = setTimeout(disarm, GHOST_CLICK_WINDOW_MS)
  open()
}
