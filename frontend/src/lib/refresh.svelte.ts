// Cross-view refresh generation for overlays that mutate data outside a view's core.

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
