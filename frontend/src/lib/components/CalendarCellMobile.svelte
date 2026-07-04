<script lang="ts">
  // One day in the PHONE month calendar grid. Same 7-column calendar as desktop, but a
  // narrow cell can't host the full interactive pills, so each task shows as a compact
  // readable line (its title on a label-colour tint). The whole cell is one tap target that
  // selects the day (its agenda shows in the split view under the grid).
  //
  // The cell is also a `calendar` DROP zone (drop-only — `dragDisabled`, its lines are
  // too small to grab): a task held from the split view's day agenda can be dropped onto
  // any cell to reschedule it. Like the desktop CalendarCell, the zone must render EVERY
  // item (svelte-dnd-action needs child↔item parity, or a dropped task could vanish), so
  // lines past the measured fit are hidden with `invisible` — they keep their child slot
  // but never show — and the drag's shadow line is always shown so a hover previews where
  // the task lands. While this day's agenda is open below (`open`), the cell FREEZES:
  // it renders its lines statically with no zone, because the agenda is the live
  // `calendar` zone for this day and two zones sharing one day's items would corrupt
  // svelte-dnd-action's drag tracking (same rule as the desktop DayPanel freeze).
  //
  // How many lines show is MEASURED, not capped: the task-list <ul> is a flex-1 region
  // whose height is fixed by the cell layout (independent of its own contents), so we read
  // it with bind:clientHeight and divide by one rendered line's measured height to show
  // exactly as many lines as the screen allows. The "+N more" row is a SIBLING below the
  // <ul> (never inside it — it would break the zone's child↔item parity); it takes its own
  // height, shrinking the measured region, so the fit stays exact (pure math in lib/fit.ts,
  // unit-tested). No hardcoded per-cell line cap.
  import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { DND_FLIP_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { formatDayFull } from '../date'
  import { visibleLineCount } from '../fit'

  let {
    date,
    dateKey,
    items,
    inCurrentMonth,
    isToday,
    open = false,
    labelFor,
    onSelect,
    onConsider,
    onFinalize,
  }: {
    date: Date
    dateKey: string
    items: CellItem[]
    inCurrentMonth: boolean
    isToday: boolean
    // True while this day's agenda is open in the split view: the cell freezes (no zone).
    open?: boolean
    labelFor: (task: Task) => Label | undefined
    onSelect: () => void
    onConsider: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    onFinalize: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
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
  const overflow = $derived(items.length - visible)
  const ariaLabel = $derived(
    `${formatDayFull(date)}, ${items.length} ${items.length === 1 ? 'task' : 'tasks'}`,
  )

  const isShadow = (item: CellItem) => SHADOW_ITEM_MARKER_PROPERTY_NAME in item
</script>

{#snippet line(item: CellItem, hidden: boolean)}
  {@const label = labelFor(item.task)}
  <!-- Whole line tinted with the label colour (same ~25% `${color}40` tint as the desktop
    TaskPill, falling back to `bg-pine/10`) — recognisable at a glance and more space-efficient
    than a dot + gap in a narrow phone cell. -->
  <li
    class="truncate rounded px-1 leading-tight text-[10px] {label ? '' : 'bg-pine/10'}
      {item.task.completed ? 'text-sage line-through' : 'text-ink'} {hidden ? 'invisible' : ''}"
    style={label ? `background-color:${label.color}40` : ''}
  >
    {item.task.title}
  </li>
{/snippet}

<button
  type="button"
  onclick={onSelect}
  aria-label={ariaLabel}
  class="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition
    {isToday
    ? 'border-pine/50 bg-pine/[0.07] ring-1 ring-inset ring-pine/15'
    : inCurrentMonth
      ? 'border-lichen bg-cell'
      : 'border-lichen/70 bg-cell-out'}
    {open ? 'ring-2 ring-inset ring-pine/50' : ''}"
>
  <span
    class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums
      {isToday ? 'bg-pine text-surface' : inCurrentMonth ? 'text-ink' : 'text-sage/60'}"
  >
    {date.getDate()}
  </span>

  {#if open}
    <!-- Frozen: the split view's day agenda owns this day's drag zone; render statically. -->
    <ul
      bind:this={listEl}
      bind:clientHeight={listHeight}
      class="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      {#each items as item, i (item.id)}
        {@render line(item, i >= visible)}
      {/each}
    </ul>
  {:else}
    <ul
      bind:this={listEl}
      bind:clientHeight={listHeight}
      class="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      use:dndzone={{
        items,
        type: 'calendar',
        flipDurationMs: DND_FLIP_MS,
        dragDisabled: true,
        dropTargetStyle: {},
        dropTargetClasses: ['rounded-md', ...DROP_TARGET_RING_CLASSES],
        zoneItemTabIndex: -1,
      }}
      onconsider={(e) => onConsider(dateKey, e)}
      onfinalize={(e) => onFinalize(dateKey, e)}
    >
      {#each items as item, i (item.id)}
        {@render line(item, i >= visible && !isShadow(item))}
      {/each}
    </ul>
  {/if}

  {#if overflow > 0}
    <span class="shrink-0 truncate pl-0.5 text-[10px] leading-tight text-sage">
      +{overflow} more
    </span>
  {/if}
</button>
