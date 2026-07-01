<script lang="ts">
  // One day in the month grid: a wide "open day" header (the day number) plus that
  // day's tasks as label-colored pills. The pills live in a svelte-dnd-action zone,
  // so a non-recurring task can be dragged to another day's cell (the parent persists
  // the new date); a plain tap on a pill opens the day sheet. This cell is used only on
  // wider screens — a phone shows MonthView's compact dot-grid + readable agenda instead.
  //
  // The zone must render EVERY item (svelte-dnd-action needs child↔item parity, or a
  // dropped task could vanish), so we never slice — the list is clipped with
  // overflow-hidden and a "+N more" footer hints at the rest.
  //
  // Tapping the day number (or "+N more") opens the day sheet via `onSelect`;
  // tapping a task pill edits that task via `onEditTask`.
  //
  // While this day's floating DayPanel is open (`open`), the cell FREEZES: it renders its
  // pills statically with no drag zone, because the panel is now the live `calendar` zone
  // for this day and two zones sharing one day's items would corrupt svelte-dnd-action.
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull } from '../date'
  import { DND_FLIP_MS, DND_GRID_TOUCH_HOLD_MS, MONTH_CELL_MAX_TITLES } from '../constants'
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

  const overflow = $derived(items.length - MONTH_CELL_MAX_TITLES)
  const ariaLabel = $derived(
    `${formatDayFull(date)}, ${items.length} ${items.length === 1 ? 'task' : 'tasks'}`,
  )
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

    <!-- Quick-add straight onto this day. Desktop: revealed on cell hover/focus so the grid
         stays calm. Hidden on a phone here (the month cells are tiny) — tap the day to open
         its sheet, which has its own "Add a task". -->
    <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" />
  </div>

  {#snippet pills(canDrag: boolean)}
    {#each items as item (item.id)}
      <li>
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
    <ul class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
      {@render pills(false)}
    </ul>
  {:else}
    <ul
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
      use:dragHandleZone={{
        items,
        type: 'calendar',
        flipDurationMs: DND_FLIP_MS,
        delayTouchStart: DND_GRID_TOUCH_HOLD_MS,
        dragDisabled: pending,
        dropTargetStyle: {},
        dropTargetClasses: ['rounded-md', 'ring-2', 'ring-inset', 'ring-pine/40', 'bg-pine/5'],
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
