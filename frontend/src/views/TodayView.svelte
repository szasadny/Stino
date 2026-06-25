<script lang="ts">
  // Today: everything due today, grouped by label — the first thing reached for
  // each morning. It's the same grouped layout as the month/week day sheet, but a
  // standing view rather than a dialog, so the agenda renders inline. No new
  // endpoint: the existing `?date=` query for today (api.tasks.forDate). Reuses
  // the DayAgenda component slice 4 extracted for exactly this.
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import type { Label, Task } from '../lib/types'
  import { formatDayFull, toISODate } from '../lib/date'
  import { errorMessage } from '../lib/errors'
  import { replaceOccurrence, toggleCompletion } from '../lib/task-actions'
  import DayAgenda from '../lib/components/DayAgenda.svelte'
  import EmptyState from '../lib/components/EmptyState.svelte'

  const today = new Date()
  const heading = formatDayFull(today)

  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let busy = $state(false)

  const count = $derived(tasks.length)

  onMount(load)

  async function load() {
    loading = true
    error = null
    try {
      // Labels are needed to group; load both together for the day's view.
      const [t, l] = await Promise.all([api.tasks.forDate(toISODate(today)), api.labels.list()])
      tasks = t
      labels = l
    } catch (err) {
      error = errorMessage(err, 'Could not load today')
    } finally {
      loading = false
    }
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

<section class="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
  <header>
    <h1 class="text-xl font-semibold text-pine-deep">{heading}</h1>
    <p class="mt-1 text-sm text-sage">
      {#if loading}
        Loading…
      {:else}
        {count}
        {count === 1 ? 'task' : 'tasks'} due today
      {/if}
    </p>
  </header>

  {#if error}
    <p
      role="alert"
      class="mt-4 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark"
    >
      {error}
    </p>
  {/if}

  <div class="mt-5">
    {#if loading}
      <p class="py-8 text-center text-sm text-sage">Loading…</p>
    {:else if count === 0}
      <EmptyState message="Nothing due today." />
    {:else}
      <DayAgenda {tasks} {labels} onToggle={toggle} />
    {/if}
  </div>
</section>
