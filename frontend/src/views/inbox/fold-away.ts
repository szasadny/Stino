import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
import type { TransitionConfig } from 'svelte/transition'
import { INBOX_COMPLETE_EXIT_MS, INBOX_FOLD_SLIDE_PX } from '../../lib/constants'

// Mid-drag the row is the library's shadow item; an outro there keeps the row from returning.
export function foldAway(
  node: Pick<HTMLElement, 'offsetHeight'>,
  { dragging }: { dragging: boolean },
): TransitionConfig {
  if (dragging) return { duration: 0 }
  const height = node.offsetHeight
  return {
    duration: prefersReducedMotion.current ? 0 : INBOX_COMPLETE_EXIT_MS,
    easing: cubicOut,
    css: (t, u) =>
      `overflow: hidden; height: ${t * height}px; opacity: ${t}; transform: translateX(${u * INBOX_FOLD_SLIDE_PX}px);`,
  }
}
