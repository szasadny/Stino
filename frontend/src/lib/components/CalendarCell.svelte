<script lang="ts">
  // Keep child/item parity for svelte-dnd-action; hide overflow pills with `invisible`.
  // When DayPanel is open, this cell freezes so only the panel owns the day's zone.
  import {
    dragHandleZone,
    SHADOW_ITEM_MARKER_PROPERTY_NAME,
    type DndEvent,
  } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull } from '../date'
  import { DND_FLIP_MS, DND_GRID_TOUCH_HOLD_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { visibleLineCount } from '../fit'
  import TaskPill from './TaskPill.svelte'
  import QuickAddButton from './QuickAddButton.svelte'

  let {
    date,
    dateKey,
    items,
    inCurrentMonth,
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
    inCurrentMonth: boolean
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

  // Measurements let fit logic adapt to the rendered cell size.
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
  class="group flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden rounded-lg border p-1 transition sm:p-1.5
    {isToday
    ? 'border-pine/50 bg-pine/[0.07] ring-1 ring-inset ring-pine/15'
    : inCurrentMonth
      ? 'border-lichen bg-cell'
      : 'border-lichen/70 bg-cell-out'}
    {open ? 'ring-2 ring-inset ring-pine/50' : ''}"
>
  <div class="flex shrink-0 items-center justify-between">
    <button
      type="button"
      onclick={onSelect}
      aria-label={ariaLabel}
      class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums transition
        {isToday
        ? 'bg-pine text-surface hover:bg-pine-deep'
        : inCurrentMonth
          ? 'text-ink hover:bg-pine/10 hover:text-pine-deep'
          : 'text-sage/60 hover:bg-pine/10 hover:text-pine-deep'}"
    >
      {date.getDate()}
    </button>

    <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" />
  </div>

  {#snippet pills(canDrag: boolean)}
    {#each items as item, i (item.id)}
      <li class={i >= visible && !isShadow(item) ? 'invisible' : ''}>
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

  {#if overflow > 0}
    <button
      type="button"
      onclick={onSelect}
      class="shrink-0 pl-0.5 text-left text-[11px] leading-tight text-sage transition hover:text-pine-deep"
    >
      +{overflow} more
    </button>
  {/if}
</div>
