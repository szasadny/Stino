<script lang="ts">
  // One day in the month grid: the day number plus a compact preview of that
  // day's tasks. Wide screens show up to three titles with a colored dot and a
  // "+N more" overflow; narrow screens collapse to a row of dots so the month
  // stays legible on a phone. The whole cell is the tap target (opens the day).
  import type { Label, Task } from '../types'
  import { formatDayFull } from '../date'
  import { MONTH_CELL_MAX_DOTS, MONTH_CELL_MAX_TITLES } from '../constants'
  import TaskDot from './TaskDot.svelte'

  type Decorated = { task: Task; label: Label | undefined }

  let {
    date,
    tasks,
    inCurrentMonth,
    isToday,
    labelFor,
    onSelect,
  }: {
    date: Date
    tasks: Task[]
    inCurrentMonth: boolean
    isToday: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
  } = $props()

  const decorated = $derived<Decorated[]>(tasks.map((task) => ({ task, label: labelFor(task) })))
  const titles = $derived(decorated.slice(0, MONTH_CELL_MAX_TITLES))
  const titleOverflow = $derived(decorated.length - titles.length)
  const dots = $derived(decorated.slice(0, MONTH_CELL_MAX_DOTS))
  const dotOverflow = $derived(decorated.length - dots.length)

  const label = $derived(
    `${formatDayFull(date)}, ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
  )
</script>

<button
  type="button"
  onclick={onSelect}
  aria-label={label}
  class="flex h-full min-h-[4.25rem] w-full flex-col gap-1 rounded-lg border p-1 text-left transition hover:border-pine/60 hover:bg-pine/5 sm:min-h-[6.5rem] sm:p-1.5
    {inCurrentMonth ? 'bg-surface' : 'bg-fog/40'}
    {isToday ? 'border-pine/40' : 'border-lichen'}"
>
  <span
    class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums
      {isToday ? 'bg-pine text-surface' : inCurrentMonth ? 'text-ink' : 'text-sage/60'}"
  >
    {date.getDate()}
  </span>

  <!-- Wide screens: a few titles + overflow count -->
  <span class="hidden min-h-0 flex-1 flex-col gap-0.5 sm:flex">
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
    {#if titleOverflow > 0}
      <span class="pl-2.5 text-[11px] leading-tight text-sage">+{titleOverflow} more</span>
    {/if}
  </span>

  <!-- Narrow screens: dots only -->
  {#if tasks.length > 0}
    <span class="flex flex-wrap items-center gap-1 sm:hidden">
      {#each dots as item (`${item.task.id}:${item.task.occurrence_date ?? ''}`)}
        <TaskDot task={item.task} label={item.label} />
      {/each}
      {#if dotOverflow > 0}
        <span class="text-[10px] leading-none text-sage">+{dotOverflow}</span>
      {/if}
    </span>
  {/if}
</button>
