<script lang="ts">
  // Today: everything due today, grouped by label — the first thing reached for each
  // morning. Same grouped layout as the month/week day sheet, but a standing view rather
  // than a dialog, so the agenda renders inline. No new endpoint: the existing `?date=`
  // query for today. All task orchestration lives in the shared TaskCore.
  import { onMount } from 'svelte'
  import { api, type TaskInput } from '../lib/api'
  import type { Task } from '../lib/types'
  import { formatDayFull, toISODate } from '../lib/date'
  import { taskToDraft } from '../lib/composer'
  import { createTaskCore } from '../lib/controllers/task-core.svelte'
  import DayAgenda from '../lib/components/DayAgenda.svelte'
  import ErrorAlert from '../lib/components/ErrorAlert.svelte'
  import EmptyState from '../lib/components/EmptyState.svelte'
  import TaskComposerDialog from '../lib/components/TaskComposerDialog.svelte'

  const today = new Date()
  const heading = formatDayFull(today)
  const todayKey = toISODate(today)

  const core = createTaskCore()

  // The editor: 'new' adds a task to today; a Task edits it; null is closed.
  let editing = $state<Task | 'new' | null>(null)

  const count = $derived(core.tasks.length)

  onMount(load)

  function load() {
    return core.loadWith(async () => {
      // Labels are needed to group; load both together for the day's view.
      const [tasks, labels] = await Promise.all([api.tasks.forDate(todayKey), api.labels.list()])
      return { tasks, labels }
    }, 'Could not load today')
  }

  // Add a task to today / edit one, then reload so the list re-sorts. A new task defaults
  // to today's date (prefilled in the editor); changing or clearing the date just means it
  // no longer shows here after the reload.
  async function save(input: TaskInput) {
    if (editing == null) return
    const target = editing
    const persist =
      target === 'new'
        ? () => api.tasks.create(input).then(() => {})
        : () => api.tasks.update(target.id, input).then(() => {})
    if (await core.save(persist, load, 'Could not save the task')) editing = null
  }

  // Delete the task being edited, then reload so it drops from the day.
  async function remove() {
    if (editing == null || editing === 'new') return
    const id = editing.id
    if (
      await core.save(() => api.tasks.remove(id).then(() => {}), load, 'Could not delete the task')
    )
      editing = null
  }
</script>

<section class="mx-auto flex h-full w-full max-w-2xl flex-col px-4">
  <header class="flex shrink-0 items-start justify-between gap-3 pt-6 sm:pt-8">
    <div>
      <h1 class="text-xl font-semibold text-pine-deep">{heading}</h1>
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
      onclick={() => (editing = 'new')}
      class="flex shrink-0 items-center gap-1.5 rounded-lg bg-pine px-3 py-2 text-sm font-medium text-surface transition hover:bg-pine-deep"
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
        onEdit={(task) => (editing = task)}
      />
    {/if}
  </div>

  <TaskComposerDialog
    open={editing != null}
    title={editing === 'new' ? 'New task' : 'Edit task'}
    submitLabel={editing === 'new' ? 'Add' : 'Save'}
    labels={core.labels}
    initial={editing === 'new' ? { date: todayKey } : editing ? taskToDraft(editing) : {}}
    busy={core.pending}
    onSubmit={save}
    onDelete={editing && editing !== 'new' ? remove : undefined}
    onClose={() => (editing = null)}
  />
</section>
