<script lang="ts">
  // One day in the month grid: a wide "open day" header (the day number) plus that
  // day's tasks as label-colored pills. The pills live in a svelte-dnd-action zone,
  // so a non-recurring task can be dragged to another day's cell (the parent persists
  // the new date); a plain tap on a pill opens the day sheet. On a phone the pills
  // collapse to slim colored bars so the month stays legible.
  //
  // The zone must render EVERY item (svelte-dnd-action needs child↔item parity, or a
  // dropped task could vanish), so we never slice — the list is clipped with
  // overflow-hidden and a "+N more" footer hints at the rest.
  //
  // Tapping the day number (or "+N more") opens the day sheet via `onSelect`;
  // tapping a task pill edits that task via `onEditTask`.
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull } from '../date'
  import { DND_FLIP_MS, MONTH_CELL_MAX_TITLES } from '../constants'
  import TaskPill from './TaskPill.svelte'
  import QuickAddButton from './QuickAddButton.svelte'

  let {
    date,
    dateKey,
    items,
    inCurrentMonth,
    isToday,
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
  class="group flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden rounded-lg border p-1 sm:p-1.5
    {inCurrentMonth ? 'bg-surface' : 'bg-fog/40'}
    {isToday ? 'border-pine/40' : 'border-lichen'}"
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

  <ul
    class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
    use:dragHandleZone={{
      items,
      type: 'calendar',
      flipDurationMs: DND_FLIP_MS,
      delayTouchStart: 150,
      dragDisabled: pending,
      dropTargetStyle: {},
      dropTargetClasses: ['rounded-md', 'ring-2', 'ring-inset', 'ring-pine/40', 'bg-pine/5'],
    }}
    onconsider={(e) => onConsider(dateKey, e)}
    onfinalize={(e) => onFinalize(dateKey, e)}
  >
    {#each items as item (item.id)}
      <li>
        <TaskPill
          task={item.task}
          label={labelFor(item.task)}
          density="auto"
          draggable={true}
          onOpen={() => onEditTask(item.task)}
          {onToggle}
        />
      </li>
    {/each}
  </ul>

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
