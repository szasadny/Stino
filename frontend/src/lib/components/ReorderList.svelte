<script lang="ts" generics="T extends { id: string | number }">
  import type { Snippet } from 'svelte'
  import { dndzone, dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action'
  import { DND_FLIP_MS, DND_TOUCH_HOLD_MS, DRAG_HANDLE_SIZE_CLASS } from '../constants'
  import { DRAG_TO_REORDER } from '../messages'
  import { isCompact } from '../viewport.svelte'

  // `item` renders exactly one <li> per entry; `handle` is null on a phone (hold-to-drag).
  let {
    items,
    type,
    disabled = false,
    class: className = '',
    onConsider,
    onFinalize,
    item,
  }: {
    items: T[]
    type?: string
    disabled?: boolean
    class?: string
    onConsider: (e: CustomEvent<DndEvent<T>>) => void
    onFinalize: (e: CustomEvent<DndEvent<T>>) => void
    item: Snippet<[T, Snippet | null]>
  } = $props()
</script>

{#snippet handle()}
  <div
    use:dragHandle
    title={DRAG_TO_REORDER}
    class="grid {DRAG_HANDLE_SIZE_CLASS} cursor-grab touch-none place-items-center rounded text-sage transition hover:text-pine-deep active:cursor-grabbing"
  >
    <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  </div>
{/snippet}

{#if isCompact()}
  <ul
    class={className}
    use:dndzone={{
      items,
      type,
      flipDurationMs: DND_FLIP_MS,
      dropTargetStyle: {},
      dragDisabled: disabled,
      delayTouchStart: DND_TOUCH_HOLD_MS,
      zoneItemTabIndex: -1,
    }}
    onconsider={onConsider}
    onfinalize={onFinalize}
  >
    {#each items as entry (entry.id)}
      {@render item(entry, null)}
    {/each}
  </ul>
{:else}
  <ul
    class={className}
    use:dragHandleZone={{
      items,
      type,
      flipDurationMs: DND_FLIP_MS,
      dropTargetStyle: {},
      dragDisabled: disabled,
    }}
    onconsider={onConsider}
    onfinalize={onFinalize}
  >
    {#each items as entry (entry.id)}
      {@render item(entry, handle)}
    {/each}
  </ul>
{/if}
