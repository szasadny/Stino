<script lang="ts">
  // The month calendar — the primary view. A 6×7 Monday-first calendar grid on every
  // screen; each scheduled task shows on its occurrence day (a recurring task appears on
  // every occurrence the backend expands into the range). Navigate months, jump to today,
  // tap a day to zoom into it (the day sheet), tap a pill to edit it, tick a pill to
  // complete it, drag a pill to another day to reschedule it. On a phone the cells are too
  // narrow for the full pills, so each shows compact readable task lines (CalendarCellMobile)
  // — the day's tasks are still legible at a glance and tapping the cell opens the same day
  // sheet. Task orchestration lives in the shared TaskCore + calendar board; this view is
  // thin glue + markup. Date math: lib/date.ts.
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
  import { isCompact } from '../lib/viewport.svelte'
  import { createTaskCore } from '../lib/controllers/task-core.svelte'
  import { createCalendarBoard } from '../lib/controllers/calendar-board.svelte'
  import { createGridComposer } from '../lib/controllers/grid-composer.svelte'
  import {
    createCalendarSelection,
    preloadLabels,
  } from '../lib/controllers/calendar-selection.svelte'
  import CalendarCell from '../lib/components/CalendarCell.svelte'
  import CalendarCellMobile from '../lib/components/CalendarCellMobile.svelte'
  import ErrorAlert from '../lib/components/ErrorAlert.svelte'
  import DaySheet from '../lib/components/DaySheet.svelte'
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
  const cal = createCalendarBoard(core, () => gridKeys, loadRange)
  // The grid add/edit dialog ('add' = header "+", date prefilled; 'edit' = tapped pill).
  const composer = createGridComposer(core, loadRange)

  const sel = createCalendarSelection(core)
  // The day-zoom sheet's add/edit/delete: throwing CRUD through the shared lock (reloads the
  // range on success), so the sheet stays serialized with grid toggles/drags. Reuses the same
  // `loadRange` resync as everything else in this view.
  const dayCrud = core.dayCrud(loadRange)

  onMount(async () => {
    await preloadLabels(core)
    await loadRange()
  })

  function loadRange() {
    return core.loadWith(
      async () => ({
        tasks: await api.tasks.range(toISODate(grid[0]), toISODate(grid[grid.length - 1])),
      }),
      'Could not load the calendar',
    )
  }

  function go(delta: number) {
    const next = addMonths(viewYear, viewMonth, delta)
    viewYear = next.year
    viewMonth = next.month
    sel.selectedDate = null
    loadRange()
  }

  function goToday() {
    viewYear = today.getFullYear()
    viewMonth = today.getMonth()
    sel.selectedDate = null
    loadRange()
  }
</script>

<section class="flex h-full flex-col px-3 py-3 sm:px-5 sm:py-4">
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
    <!-- Phone: the same calendar grid, but each cell shows compact readable task lines
         (a colour dot + title) instead of the full pills; tap a day to open its popup.
         Only the month's actual week-rows render, so the cells get the reclaimed height. -->
    <div
      class="grid min-h-0 flex-1 grid-cols-7 gap-1"
      style:grid-template-rows="repeat({weeks}, minmax(0, 1fr))"
    >
      {#each compactCells as date, i (gridKeys[i])}
        <CalendarCellMobile
          {date}
          items={cal.board[gridKeys[i]] ?? []}
          inCurrentMonth={isSameMonth(date, viewMonth)}
          isToday={gridKeys[i] === todayKey}
          labelFor={sel.labelFor}
          onSelect={() => (sel.selectedDate = date)}
        />
      {/each}
    </div>
  {:else}
    <div class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5">
      {#each grid as date, i (gridKeys[i])}
        <CalendarCell
          {date}
          dateKey={gridKeys[i]}
          items={cal.board[gridKeys[i]] ?? []}
          inCurrentMonth={isSameMonth(date, viewMonth)}
          isToday={gridKeys[i] === todayKey}
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

<!-- The day popup: tap any day cell (desktop or phone) to zoom in and add / edit /
     complete / reorder that day's tasks. Only one is ever open, so its single DayAgenda
     is the only drag zone live at a time. -->
<DaySheet
  date={sel.selectedDate}
  tasks={sel.selectedTasks}
  labels={core.labels}
  pending={core.pending}
  onToggle={core.toggle}
  onReorder={core.reorder}
  onReorderLabels={core.reorderLabels}
  onCreate={dayCrud.create}
  onUpdate={dayCrud.update}
  onDelete={dayCrud.remove}
  onClose={() => (sel.selectedDate = null)}
/>

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
