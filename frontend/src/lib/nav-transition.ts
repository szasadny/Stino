// View-Transitions navigation for calendar periods. State and range fetch run inside
// the transition so snapshots avoid duplicate drag zones and the new pane is populated.
import { tick } from 'svelte'

export type NavDirection = 'forward' | 'back'

// A token prevents an older navigation from clearing a newer direction attribute.
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
  // The CSS picks slide-left vs slide-right off this attribute.
  document.documentElement.dataset.navDir = dir
  const transition = document.startViewTransition(async () => {
    await apply()
    await tick() // let Svelte flush the new period into the DOM before the snapshot
  })
  try {
    await transition.finished
  } catch {
    // A newer navigation (or the browser) skipped this transition — fine.
  } finally {
    if (navToken === token) delete document.documentElement.dataset.navDir
  }
}
