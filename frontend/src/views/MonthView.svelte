<script lang="ts">
  // The month calendar — the primary view. A 6×7 Monday-first grid; each occurrence shows on
  // its day. Tap a day to zoom, tap a pill to edit, tick to complete, drag a pill to another
  // day to reschedule. On a phone the cells show compact task lines (CalendarCellMobile) and
  // tapping a day opens a split: grid on top, that day's agenda (DayListSection) underneath,
  // sharing the `calendar` drag zone so a held task drops onto any cell. Task orchestration
  // lives in the shared TaskCore + calendar board; this view is thin glue + markup.
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import {
    WEEKDAYS,
    addMonths,
    buildMonthGrid,
    formatMonthYear,
    isSameMonth,
    monthWeekCount,
    toISODate,
  } from '../lib/date'
  import { MONTH_EXPAND_HOLD_MS, MONTH_EXPAND_ZONE_PX } from '../lib/constants'
  import { createBottomDwell, pointFrom } from '../lib/drag-scroll'
  import { isCompact } from '../lib/viewport.svelte'
  import { onRefresh } from '../lib/refresh.svelte'
  import { swipe } from '../lib/swipe'
  import { navigateWithSlide } from '../lib/nav-transition'
  import { createTaskCore } from '../lib/controllers/task-core.svelte'
  import { createCalendarBoard } from '../lib/controllers/calendar-board.svelte'
  import { createGridComposer } from '../lib/controllers/grid-composer.svelte'
  import { createCalendarSelection } from '../lib/controllers/calendar-selection.svelte'
  import CalendarCell from '../lib/components/CalendarCell.svelte'
  import CalendarCellMobile from '../lib/components/CalendarCellMobile.svelte'
  import DayListSection from '../lib/components/DayListSection.svelte'
  import ErrorAlert from '../lib/components/ErrorAlert.svelte'
  import DayPanel from '../lib/components/DayPanel.svelte'
  import TaskComposerDialog from '../lib/components/TaskComposerDialog.svelte'

  const today = new Date()
  const todayKey = toISODate(today)

  let viewYear = $state(today.getFullYear())
  let viewMonth = $state(today.getMonth())
  const grid = $derived(buildMonthGrid(viewYear, viewMonth))
  const gridKeys = $derived(grid.map(toISODate))

  // Phone only: render just the week-rows this month occupies (4–6), not a fixed 6, so
  // no all-spill-over row wastes space. The data layer (board/range) keeps the full grid.
  const weeks = $derived(monthWeekCount(viewYear, viewMonth))
  const compactCells = $derived(grid.slice(0, weeks * 7))

  const core = createTaskCore()
  const sel = createCalendarSelection(core)
  // ISO key of the zoomed day, or null. Freezes the matching grid cell so the panel/agenda
  // is the only live drag zone for that day.
  const selectedKey = $derived(sel.selectedDate ? toISODate(sel.selectedDate) : null)
  // A pinned agenda can stay open on a day outside the visible grid (after a swipe), so
  // include its key in the board and the range fetch.
  const boardKeys = $derived(
    selectedKey && !gridKeys.includes(selectedKey) ? [...gridKeys, selectedKey] : gridKeys,
  )

  const cal = createCalendarBoard(core, () => boardKeys, loadRange)
  // The grid add/edit dialog ('add' = header "+", date prefilled; 'edit' = tapped pill).
  const composer = createGridComposer(core, loadRange)

  let gridExpanded = $state(false)
  let splitEl = $state<HTMLElement | null>(null)
  $effect(() => {
    if (!isCompact() || !cal.dragging) {
      gridExpanded = false
      return
    }
    const dwell = createBottomDwell(
      MONTH_EXPAND_ZONE_PX,
      MONTH_EXPAND_HOLD_MS,
      () => (gridExpanded = true),
    )
    const onMove = (e: TouchEvent | MouseEvent) => {
      const point = pointFrom(e)
      if (!point) return
      dwell.move(point.clientY, splitEl?.getBoundingClientRect().bottom ?? window.innerHeight)
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      dwell.cancel()
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mousemove', onMove)
    }
  })

  // Mount + overlay-close refresh: fetch this range's tasks and the labels together (an
  // overlay may have changed either). Navigation uses the tasks-only loadRange.
  const loadAll = () =>
    core.loadWith(async () => {
      const [from, to] = rangeBounds()
      const [tasks, labels] = await Promise.all([api.tasks.range(from, to), api.labels.list()])
      return { tasks, labels }
    }, 'Could not load the calendar')
  onMount(loadAll)
  onRefresh(loadAll)

  // The inclusive ISO range spanning the visible grid AND any pinned open day — a swipe
  // can keep the agenda open on a day now outside the month, and its agenda must still
  // show that day's tasks.
  function rangeBounds(): [string, string] {
    let from = grid[0]
    let to = grid[grid.length - 1]
    if (sel.selectedDate) {
      if (sel.selectedDate < from) from = sel.selectedDate
      else if (sel.selectedDate > to) to = sel.selectedDate
    }
    return [toISODate(from), toISODate(to)]
  }

  function loadRange() {
    const [from, to] = rangeBounds()
    return core.loadWith(
      async () => ({ tasks: await api.tasks.range(from, to) }),
      'Could not load the calendar',
    )
  }

  // Navigate inside a directional view-transition slide, awaiting the range fetch so the new
  // month slides in already populated. An open day zoom stays pinned to its own day across
  // the navigation (the selection never moves to the new month).
  function go(delta: number) {
    void navigateWithSlide(delta > 0 ? 'forward' : 'back', async () => {
      const next = addMonths(viewYear, viewMonth, delta)
      viewYear = next.year
      viewMonth = next.month
      await loadRange()
    })
  }

  function goToday() {
    const delta = (today.getFullYear() - viewYear) * 12 + (today.getMonth() - viewMonth)
    void navigateWithSlide(delta > 0 ? 'forward' : delta < 0 ? 'back' : null, async () => {
      viewYear = today.getFullYear()
      viewMonth = today.getMonth()
      // Like a swipe, this only moves the grid — an open day stays pinned to its own day.
      await loadRange()
    })
  }
</script>

<!-- The swipe listener lives on the section, not the vt-calendar pane: a captured pane is
     skipped for hit-testing mid-slide, so a fast follow-up swipe would be eaten. -->
<section
  class="flex h-full flex-col px-3 py-3 sm:px-5 sm:py-4"
  use:swipe={{ onLeft: () => go(1), onRight: () => go(-1) }}
>
  <header class="mb-3 flex shrink-0 items-center justify-between gap-2 px-0.5">
    <div class="flex items-baseline gap-2">
      <h1 class="font-display text-xl font-semibold tracking-tight text-pine-deep sm:text-2xl">
        {formatMonthYear(viewYear, viewMonth)}
      </h1>
      {#if core.loading}
        <span class="text-xs text-sage">Loading…</span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => go(-1)}
        aria-label="Previous month"
        class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        onclick={goToday}
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        Today
      </button>
      <button
        type="button"
        onclick={() => go(1)}
        aria-label="Next month"
        class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  </header>

  <ErrorAlert error={core.error} class="mb-3" />

  <div class="grid shrink-0 grid-cols-7 gap-1.5 px-0.5 pb-1">
    {#each WEEKDAYS as weekday (weekday)}
      <div class="text-center text-[11px] font-medium uppercase tracking-wide text-sage">
        {weekday}
      </div>
    {/each}
  </div>

  {#if isCompact()}
    <!-- Phone: compact grid; tapping a day opens the split, its agenda rendering underneath
         as a shared `calendar` drag zone so a held row drops onto any cell to reschedule.
         While a held task dwells at the bottom, the agenda hides (`gridExpanded`) so the
         whole month is the drop surface. Grid + agenda share the `vt-calendar` pane. -->
    <div bind:this={splitEl} class="vt-calendar flex min-h-0 flex-1 flex-col">
      <div
        class="grid min-h-0 flex-[11] grid-cols-7 gap-1"
        style:grid-template-rows="repeat({weeks}, minmax(0, 1fr))"
      >
        {#each compactCells as date, i (gridKeys[i])}
          <CalendarCellMobile
            {date}
            dateKey={gridKeys[i]}
            items={cal.board[gridKeys[i]] ?? []}
            inCurrentMonth={isSameMonth(date, viewMonth)}
            isToday={gridKeys[i] === todayKey}
            open={gridKeys[i] === selectedKey}
            labelFor={sel.labelFor}
            onSelect={() => (sel.selectedDate = gridKeys[i] === selectedKey ? null : date)}
            onConsider={cal.consider}
            onFinalize={cal.finalize}
          />
        {/each}
      </div>

      {#if sel.selectedDate && selectedKey}
        <div
          class="mt-2 min-h-0 flex-[9] overflow-y-auto border-t border-lichen pt-2
            {gridExpanded ? 'hidden' : ''}"
        >
          <DayListSection
            date={sel.selectedDate}
            dateKey={selectedKey}
            items={cal.board[selectedKey] ?? []}
            isToday={selectedKey === todayKey}
            pending={core.pending}
            labelFor={sel.labelFor}
            onToggle={core.toggle}
            onEditTask={(task) => composer.edit(task)}
            onAdd={() => composer.add(selectedKey)}
            onClose={() => (sel.selectedDate = null)}
            onConsider={cal.consider}
            onFinalize={cal.finalize}
            emptyLabel="Nothing scheduled"
          />
        </div>
      {/if}
    </div>
  {:else}
    <div class="vt-calendar grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5">
      {#each grid as date, i (gridKeys[i])}
        <CalendarCell
          {date}
          dateKey={gridKeys[i]}
          items={cal.board[gridKeys[i]] ?? []}
          inCurrentMonth={isSameMonth(date, viewMonth)}
          isToday={gridKeys[i] === todayKey}
          open={gridKeys[i] === selectedKey}
          pending={core.pending}
          labelFor={sel.labelFor}
          onSelect={() => (sel.selectedDate = date)}
          onAdd={() => composer.add(gridKeys[i])}
          onEditTask={(task) => composer.edit(task)}
          onToggle={core.toggle}
          onConsider={cal.consider}
          onFinalize={cal.finalize}
        />
      {/each}
    </div>
  {/if}
</section>

<!-- Desktop day zoom: the floating, non-modal DayPanel — the grid stays live behind it, so a
     task can be dragged out onto another day. (Phone's day zoom is the split agenda above.) -->
{#if !isCompact() && sel.selectedDate && selectedKey}
  <DayPanel
    date={sel.selectedDate}
    dateKey={selectedKey}
    items={cal.board[selectedKey] ?? []}
    labelFor={sel.labelFor}
    pending={core.pending}
    dragging={cal.dragging}
    onConsider={cal.consider}
    onFinalize={cal.finalize}
    onToggle={core.toggle}
    onEditTask={(task) => composer.edit(task)}
    onAdd={() => composer.add(selectedKey)}
    onClose={() => (sel.selectedDate = null)}
  />
{/if}

<TaskComposerDialog
  open={composer.open}
  title={composer.title}
  submitLabel={composer.submitLabel}
  labels={core.labels}
  initial={composer.initial}
  busy={core.pending}
  onSubmit={composer.submit}
  onDelete={composer.onDelete}
  onClose={composer.close}
/>
