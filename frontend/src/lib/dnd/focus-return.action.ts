import type { Attachment } from 'svelte/attachments'
import { on } from 'svelte/events'

export type FocusTarget = EventTarget & Pick<HTMLElement, 'focus' | 'isConnected'>

// Teardown runs after the node left the DOM, where the browser does not return focus.
export function returnFocusOnDestroy<T extends HTMLElement>(
  target: () => FocusTarget | null,
  onDestroy: (node: T) => boolean = () => true,
): Attachment<T> {
  return (node) => {
    let inside = false
    const offs = [
      on(node, 'focusin', () => (inside = true)),
      // Removing a focused node can blur it without a related target; that is not leaving.
      on(node, 'focusout', (event) => {
        if (event.relatedTarget instanceof Node) inside = node.contains(event.relatedTarget)
      }),
    ]
    return () => {
      offs.forEach((off) => off())
      const active = document.activeElement
      const lost = inside && (!active || active === document.body || !active.isConnected)
      if (!onDestroy(node) || !lost) return
      const el = target()
      if (el?.isConnected) el.focus()
    }
  }
}
