import { untrack } from 'svelte'

// Owned dnd lists keyed by zone; re-projected from `source` only while no gesture is live.
export function createDropList<K extends string, T>(source: () => Record<K, T[]>) {
  let lists = $state<Record<K, T[]>>(untrack(source))
  let dragging = $state(false)

  $effect(() => {
    const next = source()
    if (untrack(() => dragging)) return
    lists = next
  })

  return {
    get lists() {
      return lists
    },
    get dragging() {
      return dragging
    },
    consider(key: K, items: T[]): void {
      dragging = true
      lists[key] = items
    },
    // Ends the gesture first, so the persisted change can re-project.
    finalize(key: K, items: T[]): void {
      lists[key] = items
      dragging = false
    },
    // A write that never touched the source would leave the dropped order on screen.
    settle(write: Promise<boolean>): void {
      void write.then((landed) => {
        if (!landed && !dragging) lists = untrack(source)
      })
    },
  }
}
