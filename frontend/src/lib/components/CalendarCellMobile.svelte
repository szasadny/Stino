<script lang="ts">
  // One day in the PHONE month calendar grid. Same 7-column calendar as desktop, but a
  // narrow cell can't host the full interactive pills, so each task shows as a compact
  // readable line (a label-colour dot + its title). The whole cell is one tap target that
  // opens the day popup (DaySheet); no drag here (that's a desktop affordance).
  //
  // How many lines show is MEASURED, not capped: the task-list <ul> is a flex-1 region
  // whose height is fixed by the cell layout (independent of its own contents), so we read
  // it with bind:clientHeight and divide by one rendered line's measured height to show
  // exactly as many lines as the screen allows. The "+N more" row lives INSIDE that <ul>
  // (so the measured height covers it and there's no measurement feedback loop); the pure
  // fit math is in lib/fit.ts (unit-tested). No hardcoded per-cell line cap.
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { formatDayFull } from '../date'
  import { visibleLineCount } from '../fit'

  let {
    date,
    items,
    inCurrentMonth,
    isToday,
    labelFor,
    onSelect,
  }: {
    date: Date
    items: CellItem[]
    inCurrentMonth: boolean
    isToday: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
  } = $props()

  // Available height of the list region (layout-fixed, so measuring it can't feed back
  // into itself) and one line's height — both measured so the fit adapts to any screen.
  let listEl = $state<HTMLUListElement | null>(null)
  let listHeight = $state(0)
  let lineHeight = $state(0)

  // Measure a real rendered line rather than assume a pixel size. Re-runs when the items
  // first render (async load) / their count changes / the cell resizes; it only writes
  // `lineHeight` (never reads it), so it can't loop.
  $effect(() => {
    void items.length
    void listHeight
    const first = listEl?.firstElementChild
    if (first) lineHeight = first.getBoundingClientRect().height
  })

  const visible = $derived(visibleLineCount(items.length, listHeight, lineHeight))
  const shown = $derived(items.slice(0, visible))
  const overflow = $derived(items.length - visible)
  const ariaLabel = $derived(
    `${formatDayFull(date)}, ${items.length} ${items.length === 1 ? 'task' : 'tasks'}`,
  )
</script>

<button
  type="button"
  onclick={onSelect}
  aria-label={ariaLabel}
  class="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition
    {isToday
    ? 'border-pine/50 bg-pine/[0.07] ring-1 ring-inset ring-pine/15'
    : inCurrentMonth
      ? 'border-lichen bg-cell'
      : 'border-lichen/70 bg-cell-out'}"
>
  <span
    class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums
      {isToday ? 'bg-pine text-surface' : inCurrentMonth ? 'text-ink' : 'text-sage/60'}"
  >
    {date.getDate()}
  </span>

  <ul
    bind:this={listEl}
    bind:clientHeight={listHeight}
    class="flex min-h-0 flex-1 flex-col overflow-hidden"
  >
    {#each shown as item (item.id)}
      {@const label = labelFor(item.task)}
      <li class="flex items-center gap-1 leading-tight">
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full {label ? '' : 'bg-pine/60'}"
          style={label ? `background-color:${label.color}` : ''}
        ></span>
        <span
          class="truncate text-[10px] {item.task.completed ? 'text-sage line-through' : 'text-ink'}"
        >
          {item.task.title}
        </span>
      </li>
    {/each}

    {#if overflow > 0}
      <li class="truncate pl-0.5 text-[10px] leading-tight text-sage">+{overflow} more</li>
    {/if}
  </ul>
</button>
