<script lang="ts">
  // The week view — a focused seven-day layout sitting between the month overview
  // and the single-day zoom. Monday-first; each day shows its tasks in the usual
  // order (timed first, then manual sort_order). Seven columns on a wide screen
  // reflow to a single stacked column on a phone. Tapping a day opens the same
  // grouped day sheet the month uses. It's the existing range query over a 7-day
  // window — no new endpoint. All date math lives in lib/date.ts.
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import type { Label, Task } from '../lib/types'
  import { addWeeks, buildWeekGrid, formatWeekRange, toISODate } from '../lib/date'
  import { errorMessage } from '../lib/errors'
  import { groupByDate } from '../lib/grouping'
  import { labelLookup } from '../lib/labels'
  import { replaceOccurrence, toggleCompletion } from '../lib/task-actions'
  import WeekDayCell from '../lib/components/WeekDayCell.svelte'
  import DaySheet from '../lib/components/DaySheet.svelte'

  const today = new Date()
  const todayKey = toISODate(today)

  let anchor = $state(today)
  const week = $derived(buildWeekGrid(anchor))
  const rangeLabel = $derived(formatWeekRange(week))

  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let busy = $state(false)
  let selectedDate = $state<Date | null>(null)

  const labelFor = $derived(labelLookup(labels))

  // Index the loaded range by occurrence_date so each day is an O(1) lookup.
  // (A recurring task lands on every occurrence day, not just its series start.)
  const tasksByDate = $derived(groupByDate(tasks))
  function tasksOn(date: Date): Task[] {
    return tasksByDate.get(toISODate(date)) ?? []
  }
  const selectedTasks = $derived(selectedDate ? tasksOn(selectedDate) : [])

  onMount(async () => {
    // Labels are just dot colors here — if they fail the week still works.
    try {
      labels = await api.labels.list()
    } catch {
      labels = []
    }
    await loadRange()
  })

  async function loadRange() {
    loading = true
    error = null
    try {
      tasks = await api.tasks.range(toISODate(week[0]), toISODate(week[week.length - 1]))
    } catch (err) {
      error = errorMessage(err, 'Could not load the week')
    } finally {
      loading = false
    }
  }

  function go(delta: number) {
    anchor = addWeeks(anchor, delta)
    selectedDate = null
    loadRange()
  }

  function goThisWeek() {
    anchor = today
    selectedDate = null
    loadRange()
  }

  async function toggle(task: Task) {
    if (busy) return
    busy = true
    error = null
    try {
      tasks = replaceOccurrence(tasks, await toggleCompletion(task))
    } catch (err) {
      error = errorMessage(err, 'Could not update the task')
    } finally {
      busy = false
    }
  }
</script>

<section class="mx-auto w-full max-w-5xl px-2 py-4 sm:px-4 sm:py-6">
  <header class="mb-3 flex items-center justify-between gap-2 px-0.5">
    <div class="flex items-baseline gap-2">
      <h1 class="text-lg font-semibold text-pine-deep sm:text-xl">
        {rangeLabel}
      </h1>
      {#if loading}
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

  {#if error}
    <p
      role="alert"
      class="mb-3 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark"
    >
      {error}
    </p>
  {/if}

  <div class="grid grid-cols-1 gap-2 sm:grid-cols-7">
    {#each week as date (toISODate(date))}
      <WeekDayCell
        {date}
        tasks={tasksOn(date)}
        isToday={toISODate(date) === todayKey}
        {labelFor}
        onSelect={() => (selectedDate = date)}
      />
    {/each}
  </div>
</section>

<DaySheet
  date={selectedDate}
  tasks={selectedTasks}
  {labels}
  onToggle={toggle}
  onClose={() => (selectedDate = null)}
/>
