<script lang="ts">
  // Keep child/item parity for svelte-dnd-action and freeze the cell while DayPanel owns its zone.
  import {
    dragHandleZone,
    SHADOW_ITEM_MARKER_PROPERTY_NAME,
    type DndEvent,
  } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull, weekdayAbbrev } from '../date'
  import { DND_FLIP_MS, DND_GRID_TOUCH_HOLD_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { visibleLineCount } from '../fit'
  import TaskPill from './TaskPill.svelte'
  import QuickAddButton from './QuickAddButton.svelte'

  let {
    date,
    dateKey,
    items,
    isToday,
    open = false,
    pending = false,
    labelFor,
    onSelect,
    onAdd,
    onEditTask,
    onToggle,
    onConsider,
    onFinalize,
  }: {
    date: Date
    dateKey: string
    items: CellItem[]
    isToday: boolean
    // The open day is owned by DayPanel, so this cell must not mount a second zone.
    open?: boolean
    // Prevent a new drag while a mutation is in flight.
    pending?: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
    onAdd: () => void
    onEditTask: (task: Task) => void
    onToggle: (task: Task) => void
    onConsider: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    onFinalize: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
  } = $props()

  let listEl = $state<HTMLUListElement | null>(null)
  let listHeight = $state(0)
  let lineHeight = $state(0)
  let rowGap = $state(0)

  // Measure a rendered pill; this effect only writes measurement state.
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

<div
  data-day-cell={dateKey}
  class="group flex h-full min-h-[4rem] w-full flex-col gap-1.5 overflow-hidden rounded-lg border p-2 transition
    {isToday
    ? 'border-pine/50 bg-pine/[0.07] ring-1 ring-inset ring-pine/15'
    : 'border-lichen bg-cell'}
    {open ? 'ring-2 ring-inset ring-pine/50' : ''}"
>
  <div class="flex shrink-0 items-center justify-between gap-1">
    <button
      type="button"
      onclick={onSelect}
      aria-label={ariaLabel}
      class="-mx-1 flex shrink-0 items-baseline gap-1.5 rounded-md px-1 text-left transition hover:bg-pine/10"
    >
      <span
        class="text-[11px] font-medium uppercase tracking-wide {isToday
          ? 'text-pine'
          : 'text-sage'}"
      >
        {weekdayAbbrev(date)}
      </span>
      <span
        class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums
          {isToday ? 'bg-pine text-surface' : 'text-ink'}"
      >
        {date.getDate()}
      </span>
    </button>

    <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" alwaysOnMobile />
  </div>

  {#snippet pills(canDrag: boolean)}
    {#each items as item, i (item.id)}
      <!-- Keep natural pill height so fit measurements match the rendered list. -->
      <li class="shrink-0 {i >= visible && !isShadow(item) ? 'invisible' : ''}">
        <TaskPill
          task={item.task}
          label={labelFor(item.task)}
          draggable={canDrag}
          onOpen={() => onEditTask(item.task)}
          {onToggle}
        />
      </li>
    {/each}
  {/snippet}

  {#if open}
    <ul
      bind:this={listEl}
      bind:clientHeight={listHeight}
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
    >
      {@render pills(false)}
    </ul>
  {:else}
    <ul
      bind:this={listEl}
      bind:clientHeight={listHeight}
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
      use:dragHandleZone={{
        items,
        type: 'calendar',
        useCursorForDetection: true,
        flipDurationMs: DND_FLIP_MS,
        delayTouchStart: DND_GRID_TOUCH_HOLD_MS,
        dragDisabled: pending,
        dropTargetStyle: {},
        dropTargetClasses: ['rounded-md', ...DROP_TARGET_RING_CLASSES],
      }}
      onconsider={(e) => onConsider(dateKey, e)}
      onfinalize={(e) => onFinalize(dateKey, e)}
    >
      {@render pills(true)}
    </ul>
  {/if}

  {#if items.length === 0}
    <span class="shrink-0 text-[11px] leading-tight text-sage/60">—</span>
  {:else if overflow > 0}
    <button
      type="button"
      onclick={onSelect}
      class="shrink-0 pl-0.5 text-left text-[11px] leading-tight text-sage transition hover:text-pine-deep"
    >
      +{overflow} more
    </button>
  {/if}
</div>
