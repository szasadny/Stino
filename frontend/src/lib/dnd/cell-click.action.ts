import type { Attachment } from 'svelte/attachments'
import { on } from 'svelte/events'
import { dragIsLive } from './drag-scroll.action'
import { presses } from './presses.action'
import { opensFromEmptySpace } from './tap'

const CONTROLS = 'a, button, input, select, textarea, label, li, [role="button"], [role="checkbox"]'

// A drop fires the browser's click before the library finalizes, so `dragging` still holds then.
export function clickOnEmptySpace(
  onClick: () => void,
  dragging: () => boolean,
): Attachment<HTMLElement> {
  return (node) =>
    on(node, 'click', (e) => {
      const control = e.target instanceof Element ? e.target.closest(CONTROLS) : null
      const open = opensFromEmptySpace({
        isTrusted: e.isTrusted,
        onControl: control != null && node.contains(control),
        dragging: dragging() || dragIsLive(),
        stationary: presses.stationary,
      })
      if (open) onClick()
    })
}
