<script lang="ts">
  // The week view — a focused seven-day layout between the month overview and the single-day
  // zoom. Monday-first; each day shows its tasks in the usual order (timed first, then manual
  // sort_order). Seven columns on a wide screen reflow to a stacked column on a phone. Same
  // gestures as the month grid (tap to open/edit, tick to complete, drag a pill to another
  // day) — all via the shared TaskCore + calendar board; this view is thin glue + markup.
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { addWeeks, buildWeekGrid, formatWeekRange, toISODate } from '../lib/date'
  import { isCompact } from '../lib/viewport.svelte'
  import { createTaskCore } from '../lib/controllers/task-core.svelte'
  import { createCalendarBoard } from '../lib/controllers/calendar-board.svelte'
  import { createGridComposer } from '../lib/controllers/grid-composer.svelte'
  import {
    createCalendarSelection,
    preloadLabels,
  } from '../lib/controllers/calendar-selection.svelte'
  import WeekDayCell from '../lib/components/WeekDayCell.svelte'
  import DayListSection from '../lib/components/DayListSection.svelte'
  import ErrorAlert from '../lib/components/ErrorAlert.svelte'
  import DaySheet from '../lib/components/DaySheet.svelte'
  import DayPanel from '../lib/components/DayPanel.svelte'
  import TaskComposerDialog from '../lib/components/TaskComposerDialog.svelte'

  const today = new Date()
  const todayKey = toISODate(today)

  let anchor = $state(today)
  const week = $derived(buildWeekGrid(anchor))
  const weekKeys = $derived(week.map(toISODate))
  const rangeLabel = $derived(formatWeekRange(week))

  const core = createTaskCore()
  const cal = createCalendarBoard(core, () => weekKeys, loadRange)
  // The grid add/edit dialog ('add' = header "+", date prefilled; 'edit' = tapped pill).
  const composer = createGridComposer(core, loadRange)

  const sel = createCalendarSelection(core)
  // The ISO key of the zoomed day, or null — drives the desktop DayPanel and freezes the
  // matching grid cell (so the panel is the only live drag zone for that day).
  const selectedKey = $derived(sel.selectedDate ? toISODate(sel.selectedDate) : null)
  // The day-zoom sheet's add/edit/delete: throwing CRUD through the shared lock (reloads the
  // range on success), so the sheet stays serialized with grid toggles/drags.
  const dayCrud = core.dayCrud(loadRange)

  onMount(async () => {
    await preloadLabels(core)
    await loadRange()
  })

  function loadRange() {
    return core.loadWith(
      async () => ({
        tasks: await api.tasks.range(toISODate(week[0]), toISODate(week[week.length - 1])),
      }),
      'Could not load the week',
    )
  }

  function go(delta: number) {
    anchor = addWeeks(anchor, delta)
    sel.selectedDate = null
    loadRange()
  }

  function goThisWeek() {
    anchor = today
    sel.selectedDate = null
    loadRange()
  }
</script>

<section class="flex h-full flex-col px-3 py-3 sm:px-5 sm:py-4">
  <header class="mb-3 flex shrink-0 items-center justify-between gap-2 px-0.5">
    <div class="flex items-baseline gap-2">
      <h1 class="font-display text-xl font-semibold tracking-tight text-pine-deep sm:text-2xl">
        {rangeLabel}
      </h1>
      {#if core.loading}
        <span class="text-xs text-sage">Loading…</span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => go(-1)}
        aria-label="Previous week"
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
        onclick={goThisWeek}
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        This week
      </button>
      <button
        type="button"
        onclick={() => go(1)}
        aria-label="Next week"
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

  {#if isCompact()}
    <!-- Phone: seven narrow columns leave no room for task text, so each day becomes
         a full-width section with its tasks as readable rows, the whole week scrolling.
         The rows are a shared `calendar` drag zone (bound to the same board as the desktop
         grid), so a held task drags from one day to another; tapping a row edits it and
         tapping a day's header zooms into the day sheet (group-by-label + the grouped view). -->
    <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      {#each week as date, i (weekKeys[i])}
        <DayListSection
          {date}
          dateKey={weekKeys[i]}
          items={cal.board[weekKeys[i]] ?? []}
          isToday={weekKeys[i] === todayKey}
          pending={core.pending}
          labelFor={sel.labelFor}
          onToggle={core.toggle}
          onEditTask={(task) => composer.edit(task)}
          onSelect={() => (sel.selectedDate = date)}
          onAdd={() => composer.add(weekKeys[i])}
          onConsider={cal.consider}
          onFinalize={cal.finalize}
          emptyLabel="Nothing scheduled"
        />
      {/each}
    </div>
  {:else}
    <div class="grid min-h-0 flex-1 grid-cols-7 gap-2">
      {#each week as date, i (weekKeys[i])}
        <WeekDayCell
          {date}
          dateKey={weekKeys[i]}
          items={cal.board[weekKeys[i]] ?? []}
          isToday={weekKeys[i] === todayKey}
          open={weekKeys[i] === selectedKey}
          pending={core.pending}
          labelFor={sel.labelFor}
          onSelect={() => (sel.selectedDate = date)}
          onAdd={() => composer.add(weekKeys[i])}
          onEditTask={(task) => composer.edit(task)}
          onToggle={core.toggle}
          onConsider={cal.consider}
          onFinalize={cal.finalize}
        />
      {/each}
    </div>
  {/if}
</section>

<!-- The day zoom. A phone day-header tap gets the full-screen grouped DaySheet
     (group-by-label + untimed drag-reorder). A desktop column tap gets the floating,
     non-modal DayPanel: the grid stays live behind it, so a task can be dragged out of
     the panel onto another day to reschedule it (via the shared calendar board). -->
{#if isCompact()}
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
{:else if sel.selectedDate && selectedKey}
  <DayPanel
    date={sel.selectedDate}
    dateKey={selectedKey}
    items={cal.board[selectedKey] ?? []}
    labelFor={sel.labelFor}
    pending={core.pending}
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
