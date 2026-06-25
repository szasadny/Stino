<script lang="ts">
  // One day in the COMPACT (phone) week view. The desktop week is seven narrow
  // columns; on a phone that leaves no room for task text, so each day instead
  // becomes a full-width section — a weekday + date header (with a quick-add) over
  // that day's tasks as readable TaskRows. The week is a multi-day overview, so the
  // rows are flat (no per-day label grouping or drag — that's the single-day job of
  // the day sheet on desktop); the day already labels the rows, so the date is
  // omitted from each row's meta line.
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull, weekdayAbbrev } from '../date'
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
  }: {
    date: Date
    items: CellItem[]
    isToday: boolean
    labelFor: (task: Task) => Label | undefined
    onToggle: (task: Task) => void
    onEditTask: (task: Task) => void
    onAdd: () => void
  } = $props()
</script>

<section class="group">
  <div class="mb-2 flex items-center justify-between gap-2 px-0.5">
    <div class="flex items-baseline gap-2">
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
    </div>
    <QuickAddButton {onAdd} label="Add a task on {formatDayFull(date)}" alwaysOnMobile />
  </div>

  {#if items.length === 0}
    <p class="px-0.5 pb-1 text-sm text-sage/70">Nothing scheduled</p>
  {:else}
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
  {/if}
</section>
