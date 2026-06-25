<script lang="ts">
  // One day in the COMPACT (phone) month grid. A wide month cell can't fit task
  // text on a phone, so here a day is just its number plus up to a few label-
  // coloured dots that hint how busy it is — the readable list lives in the agenda
  // below the grid (MonthView). The whole cell is one tap target that selects the
  // day, driving that agenda. No drag here: rescheduling on a phone is done by
  // editing a task, so this cell carries no svelte-dnd-action zone.
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull } from '../date'
  import { MONTH_CELL_MAX_DOTS } from '../constants'

  let {
    date,
    items,
    inCurrentMonth,
    isToday,
    isSelected,
    labelFor,
    onSelect,
  }: {
    date: Date
    items: CellItem[]
    inCurrentMonth: boolean
    isToday: boolean
    isSelected: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
  } = $props()

  // One dot per task, up to the cap — the colour is the label's (user data, so an
  // inline style, not a token), pine for no-label; completed occurrences fade.
  const dots = $derived(
    items.slice(0, MONTH_CELL_MAX_DOTS).map((item) => ({
      color: labelFor(item.task)?.color ?? null,
      completed: item.task.completed,
    })),
  )
  const ariaLabel = $derived(
    `${formatDayFull(date)}, ${items.length} ${items.length === 1 ? 'task' : 'tasks'}`,
  )
</script>

<button
  type="button"
  onclick={onSelect}
  aria-label={ariaLabel}
  aria-pressed={isSelected}
  class="flex h-11 w-full flex-col items-center justify-start gap-1 rounded-lg border py-1 transition
    {isSelected
    ? 'border-pine/50 bg-pine/[0.06] ring-1 ring-inset ring-pine/40'
    : 'border-transparent'}"
>
  <span
    class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums
      {isToday ? 'bg-pine text-surface' : inCurrentMonth ? 'text-ink' : 'text-sage/60'}"
  >
    {date.getDate()}
  </span>

  <span class="flex h-1.5 items-center justify-center gap-0.5">
    {#each dots as dot, i (i)}
      <span
        class="h-1.5 w-1.5 rounded-full {dot.color ? '' : 'bg-pine/60'} {dot.completed
          ? 'opacity-40'
          : ''}"
        style={dot.color ? `background-color:${dot.color}` : ''}
      ></span>
    {/each}
  </span>
</button>
