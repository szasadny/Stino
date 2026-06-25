<script lang="ts">
  // One day rendered as a full-width, readable section — the phone layout for the Week
  // view (each of the seven days). A weekday + date header sits over that day's tasks as
  // readable TaskRows, so a phone shows what's on every day at a glance instead of
  // cramming text into a grid cell. (The phone Month view uses CalendarCellMobile — a
  // calendar grid of compact cells — instead.)
  //
  // Optional props:
  //  - `onAdd` shows the quick-add "+" beside the header.
  //  - `emptyLabel` shows placeholder text on an empty day; omit it for a header-only row.
  // The rows carry no svelte-dnd-action zone (drag-reorder is a desktop affordance), so
  // any number of these sections can be stacked without colliding drop zones.
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull, weekdayLong } from '../date'
  import TaskRow from './TaskRow.svelte'
  import QuickAddButton from './QuickAddButton.svelte'

  let {
    date,
    items,
    isToday,
    labelFor,
    onToggle,
    onEditTask,
    onAdd,
    emptyLabel,
  }: {
    date: Date
    items: CellItem[]
    isToday: boolean
    labelFor: (task: Task) => Label | undefined
    onToggle: (task: Task) => void
    onEditTask: (task: Task) => void
    onAdd?: () => void
    emptyLabel?: string
  } = $props()
</script>

<section class="group">
  <div class="mb-2 flex items-center justify-between gap-2 px-0.5">
    <div class="flex items-baseline gap-2">
      <span class="text-sm font-semibold {isToday ? 'text-pine' : 'text-ink'}">
        {weekdayLong(date)}
      </span>
      <span
        class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums
          {isToday ? 'bg-pine text-surface' : 'text-ink'}"
      >
        {date.getDate()}
      </span>
    </div>

    {#if onAdd}
      <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" alwaysOnMobile />
    {/if}
  </div>

  {#if items.length > 0}
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
