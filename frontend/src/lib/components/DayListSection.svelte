<script lang="ts">
  // One day rendered as a full-width, readable section — the phone layout for the Week
  // view (each of the seven days) AND the selected day's agenda under the phone Month
  // split view's grid. A weekday + date header sits over that day's tasks as readable
  // TaskRows, so a phone shows a day at a glance instead of cramming text into a grid
  // cell.
  //
  // Optional props:
  //  - `onSelect` makes the weekday/date header tap to zoom into the day sheet — the phone
  //    path to group-by-label and the grouped view.
  //  - `onAdd` shows the quick-add "+" beside the header.
  //  - `emptyLabel` shows placeholder text on an empty day; omit it for a header-only row.
  //  - `onConsider`/`onFinalize` (with `dateKey`) turn the rows into a svelte-dnd-action
  //    `calendar` drop zone bound to the owning view's calendar board, so a task can be
  //    dragged from one day to another (reschedule) or reordered within its day — in Week,
  //    a held task hops between the seven sections (the phone counterpart of the desktop
  //    WeekDayCell columns); in the Month split, a held row drops onto any grid cell.
  //    Drag is a whole-row press-and-hold (delayTouchStart) so a tap still edits and a
  //    swipe still scrolls; the board's guarded re-projection keeps the lists stable
  //    mid-gesture. Week's day sheet (opened from the header) is a full-screen modal, so
  //    its own DayAgenda drag zone can never be live at the same time as these behind it —
  //    no freeze needed. (The Month split freezes the selected day's CELL instead, since
  //    this agenda and that cell would otherwise share one day's items.)
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { dndzone, type DndEvent } from 'svelte-dnd-action'
  import { DND_FLIP_MS, DND_TOUCH_HOLD_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { openWithoutPhantomClick } from '../phantom-click'
  import { formatDayFull, weekdayLong } from '../date'
  import TaskRow from './TaskRow.svelte'
  import QuickAddButton from './QuickAddButton.svelte'

  let {
    date,
    dateKey,
    items,
    isToday,
    pending = false,
    labelFor,
    onToggle,
    onEditTask,
    onSelect,
    onAdd,
    onConsider,
    onFinalize,
    emptyLabel,
  }: {
    date: Date
    dateKey: string
    items: CellItem[]
    isToday: boolean
    // While a mutation is in flight, lock drag-start so a move can't race it.
    pending?: boolean
    labelFor: (task: Task) => Label | undefined
    onToggle: (task: Task) => void
    onEditTask: (task: Task) => void
    onSelect?: () => void
    onAdd?: () => void
    // When both are given (with dateKey), the rows become a cross-day drop zone.
    onConsider?: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    onFinalize?: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    emptyLabel?: string
  } = $props()

  const draggable = $derived(onConsider != null && onFinalize != null)
</script>

{#snippet dayLabel()}
  <span class="text-sm font-semibold {isToday ? 'text-pine' : 'text-ink'}">
    {weekdayLong(date)}
  </span>
  <span
    class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums
      {isToday ? 'bg-pine text-surface' : 'text-ink'}"
  >
    {date.getDate()}
  </span>
{/snippet}

<section class="group">
  <div class="mb-2 flex items-center justify-between gap-2 px-0.5">
    {#if onSelect}
      <!-- Tap the header to zoom into the day sheet (group-by-label + drag-reorder). The
           chevron hints the affordance on a phone, where there's no hover to reveal it. -->
      <button
        type="button"
        onclick={onSelect}
        aria-label="Open {formatDayFull(date)}"
        class="-ml-1 flex items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-pine/5 active:bg-pine/10"
      >
        {@render dayLabel()}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-3.5 w-3.5 text-sage/70"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    {:else}
      <div class="flex items-center gap-2">
        {@render dayLabel()}
      </div>
    {/if}

    {#if onAdd}
      <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" alwaysOnMobile />
    {/if}
  </div>

  {#if draggable}
    <!-- Cross-day / within-day drag zone: all seven day-sections share the `calendar`
         type, so a held task can be dropped onto another day (reschedule) or reordered in
         place. Rendered even when empty (min-height) so an empty day is a valid drop
         target. A whole-row press-and-hold starts the drag; a tap opens the editor. -->
    <ul
      class="min-h-[2.75rem] space-y-2"
      use:dndzone={{
        items,
        type: 'calendar',
        flipDurationMs: DND_FLIP_MS,
        delayTouchStart: DND_TOUCH_HOLD_MS,
        dragDisabled: pending,
        dropTargetStyle: {},
        dropTargetClasses: ['rounded-lg', ...DROP_TARGET_RING_CLASSES],
        zoneItemTabIndex: -1,
      }}
      onconsider={(e) => onConsider?.(dateKey, e)}
      onfinalize={(e) => onFinalize?.(dateKey, e)}
    >
      {#each items as item (item.id)}
        <li>
          <TaskRow
            task={item.task}
            label={labelFor(item.task)}
            onToggle={() => onToggle(item.task)}
            onEdit={() => openWithoutPhantomClick(() => onEditTask(item.task))}
            holdToDrag
          />
        </li>
      {/each}
    </ul>
    {#if items.length === 0 && emptyLabel}
      <p class="px-0.5 pb-1 text-sm text-sage/70">{emptyLabel}</p>
    {/if}
  {:else if items.length > 0}
    <ul class="space-y-2">
      {#each items as item (item.id)}
        <li>
          <TaskRow
            task={item.task}
            label={labelFor(item.task)}
            onToggle={() => onToggle(item.task)}
            onEdit={() => onEditTask(item.task)}
          />
        </li>
      {/each}
    </ul>
  {:else if emptyLabel}
    <p class="px-0.5 pb-1 text-sm text-sage/70">{emptyLabel}</p>
  {/if}
</section>
