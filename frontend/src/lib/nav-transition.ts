// Directional month/week navigation as a calm slide instead of an instant swap.
// Uses the View Transitions API scoped to the calendar pane — the element carrying
// the `vt-calendar` class (`view-transition-name: calendar-pane`; app.css owns the
// keyframes): the old period's snapshot slides out while the new one slides in from
// the direction of travel. Because the API animates *snapshots*, the outgoing grid
// never exists twice in the DOM — no duplicate `svelte-dnd-action` zones. The state
// change (including the range fetch) runs *inside* the transition and is awaited,
// so the incoming pane already shows the loaded tasks — no post-slide pop-in.
// Progressive enhancement: without browser support, or when the user prefers
// reduced motion, the update just applies instantly (the pre-existing behaviour).
import { tick } from 'svelte'

export type NavDirection = 'forward' | 'back'

// Distinguishes overlapping navigations: a rapid second swipe skips the running
// transition, and only the newest navigation may clear the direction attribute.
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
