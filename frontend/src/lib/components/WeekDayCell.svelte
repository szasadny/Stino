<script lang="ts">
  // One day in the week view: a weekday + date "open day" header and that day's tasks
  // as label-colored pills. This cell is the column in the desktop seven-across grid; a
  // phone shows WeekView's stacked DayListSection list instead. Pills live in a
  // svelte-dnd-action zone so a non-recurring task can be dragged to another day. The
  // week has room, so pills always show their title. The zone renders every item
  // (child↔item parity): pills past the measured fit are hidden with `invisible` and a
  // "+N more" footer hints at the rest. How many pills show is MEASURED, not capped — the
  // flex-1 pill list is read with bind:clientHeight and divided by one pill's height (plus
  // the row gap) so pills fill the whole tall week cell before overflowing (lib/fit.ts).
  // Tapping the day header (or "+N more") opens the day sheet via `onSelect`; tapping a
  // task pill edits that task via `onEditTask`.
  //
  // While this day's floating DayPanel is open (`open`), the cell FREEZES: pills render
  // statically with no drag zone, since the panel is now this day's live `calendar` zone.
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
    // True while this day's floating DayPanel is open: the cell freezes (no drag zone).
    open?: boolean
    // While a mutation is in flight, lock drag-start so a move can't race it.
    pending?: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
    // Add a task straight onto this day (the header "+"), skipping the day sheet.
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

  // Measure a real rendered pill rather than assume a pixel size. Re-runs when the items
  // first render (async load) / their count changes / the cell resizes; it only writes the
  // measurement state (never reads it), so it can't loop.
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

    <!-- Quick-add straight onto this day. The week has room, so the "+" stays visible on a
         phone; on desktop it's revealed on cell hover/focus to keep the grid calm. -->
    <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" alwaysOnMobile />
  </div>

  {#snippet pills(canDrag: boolean)}
    {#each items as item, i (item.id)}
      <!-- shrink-0: keep each pill's natural height so a full cell hides overflow pills
           cleanly instead of flex-compressing them (which would also corrupt the measured
           line height the fit relies on). -->
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
    <!-- Frozen: the floating DayPanel owns this day's drag zone; render pills statically. -->
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
