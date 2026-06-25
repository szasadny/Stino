<script lang="ts">
  // One day in the week view: a weekday + date header and a compact list of that
  // day's tasks (timed first). The same cell is a narrow column in the desktop
  // seven-across grid and a full-width section in the stacked mobile layout — the
  // parent grid arranges them, the cell renders identically. The whole cell is the
  // tap target (opens the day sheet). A few tasks show inline; the rest collapse
  // to "+N more".
  import type { Label, Task } from '../types'
  import { formatDayFull, weekdayAbbrev } from '../date'
  import { WEEK_CELL_MAX_TITLES } from '../constants'
  import TaskDot from './TaskDot.svelte'

  type Decorated = { task: Task; label: Label | undefined }

  let {
    date,
    tasks,
    isToday,
    labelFor,
    onSelect,
  }: {
    date: Date
    tasks: Task[]
    isToday: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
  } = $props()

  const decorated = $derived<Decorated[]>(tasks.map((task) => ({ task, label: labelFor(task) })))
  const titles = $derived(decorated.slice(0, WEEK_CELL_MAX_TITLES))
  const overflow = $derived(decorated.length - titles.length)

  const ariaLabel = $derived(
    `${formatDayFull(date)}, ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
  )
</script>

<button
  type="button"
  onclick={onSelect}
  aria-label={ariaLabel}
  class="flex h-full min-h-[4rem] w-full flex-col gap-1.5 rounded-lg border bg-surface p-2 text-left transition hover:border-pine/60 hover:bg-pine/5 sm:min-h-[9rem]
    {isToday ? 'border-pine/40' : 'border-lichen'}"
>
  <span class="flex items-baseline gap-1.5">
    <span
      class="text-[11px] font-medium uppercase tracking-wide {isToday ? 'text-pine' : 'text-sage'}"
    >
      {weekdayAbbrev(date)}
    </span>
    <span
      class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums
        {isToday ? 'bg-pine text-surface' : 'text-ink'}"
    >
      {date.getDate()}
    </span>
  </span>

  {#if tasks.length === 0}
    <span class="text-[11px] leading-tight text-sage/60">—</span>
  {:else}
    <span class="flex min-h-0 flex-1 flex-col gap-0.5">
      {#each titles as item (`${item.task.id}:${item.task.occurrence_date ?? ''}`)}
        <span class="flex items-center gap-1">
          <TaskDot task={item.task} label={item.label} />
          <span
            class="truncate text-[11px] leading-tight {item.task.completed
              ? 'text-sage line-through'
              : 'text-ink'}"
          >
            {item.task.title}
          </span>
        </span>
      {/each}
      {#if overflow > 0}
        <span class="pl-2.5 text-[11px] leading-tight text-sage">+{overflow} more</span>
      {/if}
    </span>
  {/if}
</button>
