import { tick } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'

type NavDirection = 'forward' | 'back'

// Stops an older navigation from clearing a newer direction attribute.
let navToken = 0

// Fetch before calling (task-core `loadThrough`): rendering stays paused while `apply` runs.
export async function navigateWithSlide(
  dir: NavDirection | null,
  apply: () => void | Promise<void>,
): Promise<void> {
  if (!dir || !document.startViewTransition || prefersReducedMotion.current) {
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
    await transition.updateCallbackDone
  } finally {
    // `finished` only rejects with the commit's own error, which `updateCallbackDone` surfaced.
    await transition.finished.catch(() => undefined)
    if (navToken === token) delete document.documentElement.dataset.navDir
  }
}
