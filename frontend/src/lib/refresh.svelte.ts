let version = $state(0)

// For overlays that mutated data outside a view's core.
export function bumpRefresh(): void {
  version += 1
}

// Skips the init value (the view's mount already loads); call at component init.
export function onRefresh(reload: () => unknown): void {
  let seen = version
  $effect(() => {
    if (version === seen) return
    seen = version
    void reload()
  })
}
