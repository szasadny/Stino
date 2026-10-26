// Fetch BEFORE calling (task-core `loadThrough`); `apply` only commits, so the page never
// freezes on the network while rendering is paused.
import { tick } from 'svelte'

export type NavDirection = 'forward' | 'back'

// Stops an older navigation from clearing a newer direction attribute.
let navToken = 0

export async function navigateWithSlide(
  dir: NavDirection | null,
  apply: () => void | Promise<void>,
): Promise<void> {
  if (
    !dir ||
    !document.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await apply()
    return
  }
  const token = ++navToken
  document.documentElement.dataset.navDir = dir
  const transition = document.startViewTransition(async () => {
    await apply()
    await tick() // flush the new period into the DOM before the snapshot
  })
  try {
    await transition.finished
  } catch {
    // Skipped by a newer navigation or the browser.
  } finally {
    if (navToken === token) delete document.documentElement.dataset.navDir
  }
}
