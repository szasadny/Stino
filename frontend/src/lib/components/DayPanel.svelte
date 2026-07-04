<script lang="ts">
  // The DESKTOP day-zoom: a small floating, NON-modal card anchored beside the tapped
  // calendar cell. Because there's no modal backdrop, the month/week grid behind it stays
  // fully interactive — so a task can be dragged straight out of this panel onto another
  // day's cell to reschedule it. It does that by being just another `type: 'calendar'`
  // svelte-dnd-action zone bound to the SAME board cell the grid uses (`items` +
  // `onConsider`/`onFinalize` come from the view's calendar board), so every move gesture
  // (plain reschedule, single recurring-occurrence detach, same-day reorder) is handled by
  // the exact grid logic in move.ts — nothing new to keep in sync.
  //
  // For that to be sound the OPEN day's grid cell must stop being a live drag zone while
  // this panel is up (two `calendar` zones sharing one day's items would corrupt
  // svelte-dnd-action's id tracking) — the view freezes it via the cell's `open` prop.
  //
  // A phone keeps the full-screen grouped DaySheet instead (this panel is desktop-only:
  // cross-day drag is a wide-screen gesture). Add/edit go through the view's shared grid
  // composer; complete is the shared toggle. Placement math lives in lib/panel-pos.ts.
  import { dragHandleZone, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import type { CellItem } from '../calendar-board'
  import { DND_FLIP_MS, DND_GRID_TOUCH_HOLD_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { formatDayFull } from '../date'
  import { panelPosition } from '../panel-pos'
  import TaskPill from './TaskPill.svelte'

  let {
    date,
    dateKey,
    items,
    labelFor,
    pending = false,
    dragging = false,
    onConsider,
    onFinalize,
    onToggle,
    onEditTask,
    onAdd,
    onClose,
  }: {
    date: Date
    dateKey: string
    items: CellItem[]
    labelFor: (task: Task) => Label | undefined
    // While a mutation is in flight, lock drag-start so a move can't race it.
    pending?: boolean
    dragging?: boolean
    // The view's calendar-board handlers — shared with the grid cells, keyed by day.
    onConsider: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    onFinalize: (key: string, e: CustomEvent<DndEvent<CellItem>>) => void
    onToggle: (task: Task) => void
    onEditTask: (task: Task) => void
    onAdd: () => void
    onClose: () => void
  } = $props()

  const subtitle = $derived(
    items.length === 0
      ? 'Nothing scheduled'
      : `${items.length} ${items.length === 1 ? 'task' : 'tasks'}`,
  )

  // Anchor the fixed-position card beside its day cell.
  let panelW = $state(0)
  let panelH = $state(0)
  let pos = $state<{ left: number; top: number } | null>(null)

  function recompute() {
    if (panelW === 0 || panelH === 0) return
    const cell = document.querySelector(`[data-day-cell="${dateKey}"]`)
    if (!cell) return
    pos = panelPosition(
      cell.getBoundingClientRect(),
      { width: panelW, height: panelH },
      { width: window.innerWidth, height: window.innerHeight },
    )
  }

  $effect(() => {
    // Re-anchor when the tapped day or the measured panel size changes.
    dateKey
    panelW
    panelH
    recompute()
  })

  $effect(() => {
    const onWin = () => recompute()
    window.addEventListener('resize', onWin)
    // Capture-phase: catch scrolls on inner containers too, so the card tracks its cell.
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  })

  // Escape closes the panel — but only when no modal dialog (the composer) is open on
  // top of it, so its own Escape isn't stolen.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div
  bind:clientWidth={panelW}
  bind:clientHeight={panelH}
  class="fixed z-30 max-h-[75vh] w-[19rem] animate-rise-in flex-col overflow-hidden rounded-2xl border border-lichen bg-surface shadow-overlay
    {dragging ? 'hidden' : 'flex'}
    {pos ? '' : 'pointer-events-none opacity-0'}"
  style:left="{pos?.left ?? 0}px"
  style:top="{pos?.top ?? 0}px"
  role="dialog"
  aria-label="Tasks on {formatDayFull(date)}"
>
  <header class="flex shrink-0 items-start justify-between gap-3 border-b border-lichen px-4 py-3">
    <div>
      <h2 class="font-display text-base font-semibold tracking-tight text-pine-deep">
        {formatDayFull(date)}
      </h2>
      <p class="mt-0.5 text-xs text-sage">{subtitle}</p>
    </div>
    <button
      type="button"
      onclick={onClose}
      aria-label="Close"
      class="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
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
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
    <!-- The day's tasks as a shared `calendar` drag zone: drag a pill out onto any grid
         cell to reschedule (the view's board handles it), or within the list to reorder.
         An empty day keeps a min height so it stays a droppable target. -->
    <ul
      class="flex flex-col gap-1 {items.length === 0 ? 'min-h-[3rem]' : ''}"
      use:dragHandleZone={{
        items,
        type: 'calendar',
        flipDurationMs: DND_FLIP_MS,
        delayTouchStart: DND_GRID_TOUCH_HOLD_MS,
        dragDisabled: pending,
        dropTargetStyle: {},
        dropTargetClasses: ['rounded-md', ...DROP_TARGET_RING_CLASSES],
      }}
      onconsider={(e) => onConsider(dateKey, e)}
      onfinalize={(e) => onFinalize(dateKey, e)}
    >
      {#each items as item (item.id)}
        <li>
          <TaskPill
            task={item.task}
            label={labelFor(item.task)}
            draggable={true}
            onOpen={() => onEditTask(item.task)}
            {onToggle}
          />
        </li>
      {/each}
    </ul>

    {#if items.length === 0}
      <p class="pt-2 text-center text-sm text-sage">Drag a task here or add one below.</p>
    {/if}
  </div>

  <div class="shrink-0 border-t border-lichen px-3 py-2.5">
    <button
      type="button"
      onclick={onAdd}
      class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-lichen px-3 py-2 text-sm font-medium text-sage transition hover:border-pine/40 hover:bg-pine/[0.04] hover:text-pine-deep"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      Add a task
    </button>
  </div>
</div>
