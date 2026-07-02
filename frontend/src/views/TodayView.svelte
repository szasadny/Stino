<script lang="ts">
  // Today: everything due today, grouped by label — the first thing reached for each
  // morning. Same grouped layout as the month/week day sheet, but a standing view rather
  // than a dialog, so the agenda renders inline. No new endpoint: the existing `?date=`
  // query for today. All task orchestration lives in the shared TaskCore.
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { formatDayFull, toISODate } from '../lib/date'
  import { PRIMARY_BTN_CLASS } from '../lib/constants'
  import { onRefresh } from '../lib/refresh.svelte'
  import { createTaskCore } from '../lib/controllers/task-core.svelte'
  import { createGridComposer } from '../lib/controllers/grid-composer.svelte'
  import DayAgenda from '../lib/components/DayAgenda.svelte'
  import ErrorAlert from '../lib/components/ErrorAlert.svelte'
  import EmptyState from '../lib/components/EmptyState.svelte'
  import TaskComposerDialog from '../lib/components/TaskComposerDialog.svelte'

  const today = new Date()
  const heading = formatDayFull(today)
  const todayKey = toISODate(today)

  const core = createTaskCore()
  // The add/edit dialog — the same composer controller the grids use, bound to this view's
  // reload. "Add" prefills today's date; changing or clearing the date in the editor just
  // means the task no longer shows here after the reload.
  const composer = createGridComposer(core, load)

  const count = $derived(core.tasks.length)

  onMount(load)
  // Reload after a mutating overlay (Search/Labels/Import) closes over this view.
  onRefresh(load)

  function load() {
    return core.loadWith(async () => {
      // Labels are needed to group; load both together for the day's view.
      const [tasks, labels] = await Promise.all([api.tasks.forDate(todayKey), api.labels.list()])
      return { tasks, labels }
    }, 'Could not load today')
  }
</script>

<section class="mx-auto flex h-full w-full max-w-2xl flex-col px-4">
  <header class="flex shrink-0 items-start justify-between gap-3 pt-6 sm:pt-8">
    <div>
      <h1 class="font-display text-2xl font-semibold tracking-tight text-pine-deep">{heading}</h1>
      <p class="mt-1 text-sm text-sage">
        {#if core.loading}
          Loading…
        {:else}
          {count}
          {count === 1 ? 'task' : 'tasks'} due today
        {/if}
      </p>
    </div>
    <button
      type="button"
      onclick={() => composer.add(todayKey)}
      class="{PRIMARY_BTN_CLASS} flex shrink-0 items-center gap-1.5 px-3 py-2"
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
      Add task
    </button>
  </header>

  <ErrorAlert error={core.error} class="mt-4" />

  <div class="mt-5 min-h-0 flex-1 overflow-y-auto pb-6">
    {#if core.loading}
      <p class="py-8 text-center text-sm text-sage">Loading…</p>
    {:else if count === 0}
      <EmptyState message="Nothing due today." />
    {:else}
      <DayAgenda
        tasks={core.tasks}
        labels={core.labels}
        pending={core.pending}
        onToggle={core.toggle}
        onReorder={core.reorder}
        onReorderLabels={core.reorderLabels}
        onEdit={(task) => composer.edit(task)}
      />
    {/if}
  </div>

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
</section>
