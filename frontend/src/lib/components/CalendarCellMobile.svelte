<script lang="ts">
  // Keep child/item parity for the drop-only mobile zone; hide overflow lines with `invisible`.
  // When the day's agenda is open, freeze this cell so only the agenda owns the zone.
  import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { DND_FLIP_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { formatDayFull } from '../date'
  import { visibleLineCount } from '../fit'
  import { labelTint } from '../labels'

  let {
    date,
    dateKey,
    items,
    inCurrentMonth,
    isToday,
    open = false,
    dropTarget = false,
    labelFor,
    onSelect,
    onConsider,
    onFinalize,
  }: {
    date: Date
    dateKey: string
    items: CellItem[]
    inCurrentMonth: boolean
    isToday: boolean
    // The open day is owned by the agenda, so this cell must not mount a second zone.
    open?: boolean
    // True while a dragged task hovers this cell — marks the whole cell as the drop target.
    dropTarget?: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
    onConsider: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    onFinalize: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
  } = $props()

  // Measurements let fit logic adapt to the rendered cell size.
  let listEl = $state<HTMLUListElement | null>(null)
  let listHeight = $state(0)
  let lineHeight = $state(0)
  let rowGap = $state(0)

  // Measure a rendered line; this effect only writes measurement state.
  $effect(() => {
    void items.length
    void listHeight
    const first = listEl?.firstElementChild
    if (first) lineHeight = first.getBoundingClientRect().height
    if (listEl) rowGap = parseFloat(getComputedStyle(listEl).rowGap) || 0
  })

  const visible = $derived(visibleLineCount(items.length, listHeight, lineHeight, rowGap))
  const overflow = $derived(items.length - visible)
  const ariaLabel = $derived(
    `${formatDayFull(date)}, ${items.length} ${items.length === 1 ? 'task' : 'tasks'}`,
  )

  const isShadow = (item: CellItem) => SHADOW_ITEM_MARKER_PROPERTY_NAME in item
</script>

{#snippet line(item: CellItem, hidden: boolean)}
  {@const label = labelFor(item.task)}
  <!-- Keep natural line height so fit measurements match the rendered list. -->
  <li
    class="shrink-0 truncate rounded px-1 py-px text-[10px] leading-tight {label
      ? ''
      : 'bg-pine/10'}
      {item.task.completed ? 'text-sage line-through' : 'text-ink'} {hidden ? 'invisible' : ''}"
    style={labelTint(label?.color)}
  >
    {item.task.title}
  </li>
{/snippet}

<button
  type="button"
  onclick={onSelect}
  aria-label={ariaLabel}
  class="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition
    {isToday
    ? 'border-pine/50 bg-pine/[0.07] ring-1 ring-inset ring-pine/15'
    : inCurrentMonth
      ? 'border-lichen bg-cell'
      : 'border-lichen/70 bg-cell-out'}
    {open ? 'ring-2 ring-inset ring-pine/50' : ''}
    {dropTarget ? 'border-pine bg-pine/10 ring-2 ring-inset ring-pine/60' : ''}"
>
  <span
    class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums
      {isToday ? 'bg-pine text-surface' : inCurrentMonth ? 'text-ink' : 'text-sage/60'}"
  >
    {date.getDate()}
  </span>

  {#if open}
    <ul
      bind:this={listEl}
      bind:clientHeight={listHeight}
      class="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-hidden"
    >
      {#each items as item, i (item.id)}
        {@render line(item, i >= visible)}
      {/each}
    </ul>
  {:else}
    <ul
      bind:this={listEl}
      bind:clientHeight={listHeight}
      class="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-hidden"
      use:dndzone={{
        items,
        type: 'calendar',
        flipDurationMs: DND_FLIP_MS,
        dragDisabled: true,
        // Keep the floating clone at its agenda-row size; morphing to the 10px cell line
        // shrinks it to an unreadable sliver under the finger.
        morphDisabled: true,
        dropTargetStyle: {},
        dropTargetClasses: ['rounded-md', ...DROP_TARGET_RING_CLASSES],
        zoneItemTabIndex: -1,
      }}
      onconsider={(e) => onConsider(dateKey, e)}
      onfinalize={(e) => onFinalize(dateKey, e)}
    >
      {#each items as item, i (item.id)}
        {@render line(item, i >= visible && !isShadow(item))}
      {/each}
    </ul>
  {/if}

  {#if overflow > 0}
    <span class="shrink-0 truncate pl-0.5 text-[10px] leading-tight text-sage">
      +{overflow} more
    </span>
  {/if}
</button>
