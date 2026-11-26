import { tick } from 'svelte'
import type { Action } from 'svelte/action'

type ScrollRequest = { key: string; request: number }

// Not scrollIntoView: that would also scroll the window and every other scrolling ancestor.
export const scrollToDay: Action<HTMLElement, ScrollRequest> = (node, initial) => {
  let handled = initial.request

  async function update(next: ScrollRequest): Promise<void> {
    if (next.request === handled) return
    handled = next.request
    await tick()
    const day = node.querySelector(`[data-day="${next.key}"]`)
    if (!day) return
    const offset = day.getBoundingClientRect().top - node.getBoundingClientRect().top
    node.scrollTo({ top: node.scrollTop + offset, behavior: 'instant' })
  }

  return { update: (next) => void update(next) }
}
