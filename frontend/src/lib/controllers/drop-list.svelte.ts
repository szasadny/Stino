import { SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action'

// The source's projection, except while a gesture or the write it started is live.
export function createDropList<K extends string, T>(source: () => Record<K, T[]>) {
  const projected = $derived(source())
  let held = $state.raw<Record<K, T[]> | null>(null)
  let dragging = $state(false)
  let writes = 0

  function hold(key: K, items: T[]) {
    held = { ...(held ?? projected), [key]: items }
  }

  function settle() {
    if (!dragging && writes === 0) held = null
  }

  return {
    get lists() {
      return held ?? projected
    },
    get dragging() {
      return dragging
    },
    consider(key: K, { items, info }: DndEvent<T>): void {
      // A keyboard drag ends with this consider, after the finalize of each move.
      if (info.trigger === TRIGGERS.DRAG_STOPPED) {
        dragging = false
        settle()
        return
      }
      dragging = true
      hold(key, items)
    },
    finalize(
      key: K,
      { items, info }: DndEvent<T>,
      commit: () => Promise<unknown> | undefined,
    ): void {
      // The zone an item left reports separately; after a drop with no write it must not re-hold.
      if (info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
        if (held) hold(key, items)
        return
      }
      hold(key, items)
      if (info.source === SOURCES.POINTER) dragging = false
      const write = commit()
      if (write) {
        writes++
        const done = () => {
          writes--
          settle()
        }
        void write.then(done, done)
      }
      settle()
    },
  }
}
