// Cross-view refresh signal: the overlays that mutate data outside a view's own
// TaskCore (Search's edits, the Labels manager, a TickTick import) bump this when
// they CLOSE, and each standing view re-runs its load when the version changes —
// otherwise a view only loads on mount and keeps showing pre-overlay data.
//
// Module-level reactive state (like lib/viewport.svelte.ts), exported through
// functions because a reassigned `let` can't be exported as live reactive state.
// Deliberately dumb: an unconditional bump-on-close costs one GET, and the views'
// reloads go through their core load path, whose re-projection $effects are
// already drag-guarded.

let version = $state(0)

/** The current refresh generation — views re-run their load when it changes. */
export function refreshVersion(): number {
  return version
}

/** Signal every standing view to reload (call when a mutating overlay closes). */
export function bumpRefresh(): void {
  version += 1
}

/**
 * Re-run `reload` whenever the version bumps AFTER component init (the mount
 * load is the view's own `onMount` — skipping the init value avoids a double
 * fetch). Call at component init, like any rune factory, so the `$effect`
 * attaches to the view's lifecycle.
 */
export function onRefresh(reload: () => unknown): void {
  let seen = version
  $effect(() => {
    if (version === seen) return
    seen = version
    void reload()
  })
}
