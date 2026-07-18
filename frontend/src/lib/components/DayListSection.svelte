<script lang="ts">
  // Optional handlers turn the section into a calendar drop zone or day-sheet trigger.
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
    onClose,
    onConsider,
    onFinalize,
    emptyLabel,
  }: {
    date: Date
    dateKey: string
    items: CellItem[]
    isToday: boolean
    // Prevent a new drag while a mutation is in flight.
    pending?: boolean
    labelFor: (task: Task) => Label | undefined
    onToggle: (task: Task) => void
    onEditTask: (task: Task) => void
    onSelect?: () => void
    onAdd?: () => void
    onClose?: () => void
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
      <!-- Tap the header to zoom into the day sheet; the chevron hints the affordance. -->
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

    {#if onAdd || onClose}
      <div class="flex shrink-0 items-center gap-1">
        {#if onAdd}
          <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" alwaysOnMobile />
        {/if}
        {#if onClose}
          <button
            type="button"
            onclick={onClose}
            aria-label="Hide {formatDayFull(date)}"
            class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if draggable}
    <!-- Keep the empty-day placeholder outside the zone; children must match dnd items. -->
    <div class="relative">
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
              slim
              onToggle={() => onToggle(item.task)}
              onEdit={() => openWithoutPhantomClick(() => onEditTask(item.task))}
              holdToDrag
            />
          </li>
        {/each}
      </ul>
      {#if items.length === 0 && emptyLabel}
        <p
          class="pointer-events-none absolute inset-0 flex items-center px-0.5 text-sm text-sage/70"
        >
          {emptyLabel}
        </p>
      {/if}
    </div>
  {:else if items.length > 0}
    <ul class="space-y-2">
      {#each items as item (item.id)}
        <li>
          <TaskRow
            task={item.task}
            label={labelFor(item.task)}
            slim
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
