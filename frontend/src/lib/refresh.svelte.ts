let version = $state(0)

/** Call when an overlay that mutated data outside a view's core closes. */
export function bumpRefresh(): void {
  version += 1
}

/** Skips the init value (the view's `onMount` already loads); call at component init. */
export function onRefresh(reload: () => unknown): void {
  let seen = version
  $effect(() => {
    if (version === seen) return
    seen = version
    void reload()
  })
}
