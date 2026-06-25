<script lang="ts">
  // Inbox: captured-but-unscheduled tasks (due_date IS NULL). Capture with a
  // title (+ optional label); complete, edit, or schedule a task by giving it a
  // date — scheduling moves it out of the Inbox onto the calendar, like TickTick.
  import { onMount } from 'svelte'
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action'
  import type { DndEvent } from 'svelte-dnd-action'
  import { api } from '../lib/api'
  import type { Label, Task } from '../lib/types'
  import { describeDraft, parseQuickAdd } from '../lib/quickadd'
  import { TITLE_MAX_LENGTH } from '../lib/constants'
  import { errorMessage } from '../lib/errors'
  import { labelLookup } from '../lib/labels'
  import { replaceOccurrence, toggleCompletion } from '../lib/task-actions'
  import TaskRow from '../lib/components/TaskRow.svelte'
  import RecurrencePicker from '../lib/components/RecurrencePicker.svelte'
  import EmptyState from '../lib/components/EmptyState.svelte'

  // FLIP animation duration for the drag-reorder list (kept in sync with the
  // dndzone option below so the placeholder and the moving rows settle together).
  const FLIP_MS = 150

  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let busy = $state(false)

  // Capture draft. A natural-language date in the title ("call mum tomorrow
  // 9am") is parsed client-side; `capturePreview` shows what it resolved to.
  let newTitle = $state('')
  let newLabelId = $state<number | null>(null)
  const capturePreview = $derived(describeDraft(parseQuickAdd(newTitle)))

  // Inline edit state (one row at a time).
  let editingId = $state<number | null>(null)
  let editTitle = $state('')
  let editLabelId = $state<number | null>(null)
  let editDate = $state('')
  let editRule = $state<string | null>(null)

  // Two-step delete confirm.
  let confirmingId = $state<number | null>(null)

  const labelFor = $derived(labelLookup(labels))

  onMount(load)

  async function load() {
    loading = true
    error = null
    try {
      const [t, l] = await Promise.all([api.tasks.inbox(), api.labels.list()])
      tasks = t
      labels = l
    } catch (err) {
      error = errorMessage(err, 'Could not load your inbox')
    } finally {
      loading = false
    }
  }

  async function addTask(event: SubmitEvent) {
    event.preventDefault()
    const draft = parseQuickAdd(newTitle)
    if (!draft.title || busy) return
    busy = true
    error = null
    try {
      const created = await api.tasks.create({
        title: draft.title,
        label_id: newLabelId,
        due_date: draft.due_date,
        due_time: draft.due_time,
      })
      // A parsed date schedules the task onto its day, so it leaves the Inbox;
      // only an undated capture stays in this list.
      if (!created.due_date) {
        tasks = [...tasks, created]
      }
      newTitle = ''
      newLabelId = null
    } catch (err) {
      error = errorMessage(err, 'Could not add the task')
    } finally {
      busy = false
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

  function startEdit(task: Task) {
    editingId = task.id
    editTitle = task.title
    editLabelId = task.label_id
    editDate = task.due_date ?? ''
    editRule = task.recurrence_rule
    confirmingId = null
    error = null
  }

  async function saveEdit(id: number) {
    const title = editTitle.trim()
    if (!title || busy) return
    busy = true
    error = null
    try {
      const updated = await api.tasks.update(id, {
        title,
        label_id: editLabelId,
        due_date: editDate || null,
        recurrence_rule: editRule,
      })
      editingId = null
      // Scheduling (giving it a date) moves the task out of the Inbox.
      if (updated.due_date) {
        tasks = tasks.filter((t) => t.id !== id)
      } else {
        tasks = tasks.map((t) => (t.id === id ? updated : t))
      }
    } catch (err) {
      error = errorMessage(err, 'Could not save the task')
    } finally {
      busy = false
    }
  }

  async function removeTask(id: number) {
    if (busy) return
    busy = true
    error = null
    try {
      await api.tasks.remove(id)
      tasks = tasks.filter((t) => t.id !== id)
      confirmingId = null
    } catch (err) {
      error = errorMessage(err, 'Could not delete the task')
    } finally {
      busy = false
    }
  }

  // Drag-to-reorder (svelte-dnd-action). `consider` fires continuously while
  // dragging — reflect the live order; `finalize` fires on drop — persist it.
  function reorderConsider(event: CustomEvent<DndEvent<Task>>) {
    tasks = event.detail.items
  }

  async function reorderFinalize(event: CustomEvent<DndEvent<Task>>) {
    tasks = event.detail.items
    error = null
    try {
      await api.tasks.reorder(tasks.map((t) => t.id))
    } catch (err) {
      error = errorMessage(err, 'Could not save the new order')
      load() // fall back to the server's order
    }
  }
</script>

<section class="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
  <header>
    <h1 class="text-xl font-semibold text-pine-deep">Inbox</h1>
    <p class="mt-1 text-sm text-sage">
      Capture now, schedule later — tasks without a date live here.
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

  <!-- Capture a new task -->
  <form class="mt-5 rounded-xl border border-lichen bg-surface p-3 shadow-sm" onsubmit={addTask}>
    <div class="flex items-center gap-2">
      <input
        bind:value={newTitle}
        type="text"
        placeholder="Add a task — try “call mum tomorrow 9am”"
        maxlength={TITLE_MAX_LENGTH}
        autocomplete="off"
        aria-label="New task title"
        class="min-w-0 flex-1 rounded-lg border border-lichen bg-fog px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sage focus:border-pine focus:bg-surface"
      />
      <button
        type="submit"
        disabled={!newTitle.trim() || busy}
        class="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    </div>
    {#if capturePreview}
      <p class="mt-2 flex items-center gap-1 text-xs text-sage">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-3.5 w-3.5 text-pine"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
        Scheduling for {capturePreview}
      </p>
    {/if}
    {#if labels.length > 0}
      <div class="mt-2 flex items-center gap-2">
        <label for="new-task-label" class="text-xs font-medium text-sage">Label</label>
        <select
          id="new-task-label"
          bind:value={newLabelId}
          class="rounded-lg border border-lichen bg-fog px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine focus:bg-surface"
        >
          <option value={null}>None</option>
          {#each labels as label (label.id)}
            <option value={label.id}>{label.name}</option>
          {/each}
        </select>
      </div>
    {/if}
  </form>

  <!-- Inbox list -->
  <div class="mt-5">
    {#if loading}
      <p class="py-8 text-center text-sm text-sage">Loading…</p>
    {:else if tasks.length === 0}
      <EmptyState message="Your inbox is clear. Add a task above to capture it." />
    {:else}
      <ul
        class="flex flex-col gap-2"
        use:dragHandleZone={{ items: tasks, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
        onconsider={reorderConsider}
        onfinalize={reorderFinalize}
      >
        {#each tasks as task (task.id)}
          <li>
            {#if editingId === task.id}
              <!-- Edit panel: title, label, and a date to schedule it -->
              <div class="rounded-xl border border-pine/30 bg-fog/60 p-3 shadow-sm">
                <input
                  bind:value={editTitle}
                  type="text"
                  maxlength={TITLE_MAX_LENGTH}
                  aria-label="Task title"
                  class="w-full rounded-lg border border-lichen bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-pine"
                />
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  {#if labels.length > 0}
                    <div>
                      <label for="edit-task-label" class="block text-xs font-medium text-sage"
                        >Label</label
                      >
                      <select
                        id="edit-task-label"
                        bind:value={editLabelId}
                        class="mt-1 w-full rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
                      >
                        <option value={null}>None</option>
                        {#each labels as label (label.id)}
                          <option value={label.id}>{label.name}</option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                  <div>
                    <label for="edit-task-date" class="block text-xs font-medium text-sage"
                      >Schedule for</label
                    >
                    <input
                      id="edit-task-date"
                      bind:value={editDate}
                      type="date"
                      class="mt-1 w-full rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
                    />
                  </div>
                </div>
                <div class="mt-3">
                  <RecurrencePicker value={editRule} onChange={(rule) => (editRule = rule)} />
                </div>
                <div class="mt-3 flex items-center justify-between gap-3">
                  <span class="text-xs text-sage">A date moves it onto the calendar.</span>
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onclick={() => (editingId = null)}
                      class="rounded-lg px-3 py-1.5 text-sm font-medium text-sage transition hover:text-pine-deep"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onclick={() => saveEdit(task.id)}
                      disabled={!editTitle.trim() || busy}
                      class="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-surface transition hover:bg-pine-deep disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            {:else}
              <TaskRow {task} label={labelFor(task)} onToggle={() => toggle(task)}>
                {#snippet leading()}
                  <div
                    use:dragHandle
                    title="Drag to reorder"
                    class="grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-sage transition hover:text-pine-deep active:cursor-grabbing"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.4" />
                      <circle cx="9" cy="12" r="1.4" />
                      <circle cx="9" cy="18" r="1.4" />
                      <circle cx="15" cy="6" r="1.4" />
                      <circle cx="15" cy="12" r="1.4" />
                      <circle cx="15" cy="18" r="1.4" />
                    </svg>
                  </div>
                {/snippet}
                {#snippet trailing()}
                  {#if confirmingId === task.id}
                    <span class="text-xs text-sage">Delete?</span>
                    <button
                      type="button"
                      onclick={() => removeTask(task.id)}
                      disabled={busy}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-bark transition hover:bg-bark/10 disabled:opacity-40"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onclick={() => (confirmingId = null)}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:text-pine-deep"
                    >
                      No
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => startEdit(task)}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onclick={() => {
                        confirmingId = task.id
                        error = null
                      }}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark"
                    >
                      Delete
                    </button>
                  {/if}
                {/snippet}
              </TaskRow>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
