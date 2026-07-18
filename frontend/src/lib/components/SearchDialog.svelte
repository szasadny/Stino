<script lang="ts">
  // Results edit inline to avoid stacking a second modal.
  import { onDestroy } from 'svelte'
  import { api, type TaskInput } from '../api'
  import type { Label, Task } from '../types'
  import { taskToDraft } from '../composer'
  import { SEARCH_DEBOUNCE_MS } from '../constants'
  import { formatShortDate, fromISODate } from '../date'
  import { errorMessage } from '../errors'
  import { labelLookup } from '../labels'
  import { replaceOccurrence, toggleCompletion } from '../task-actions'
  import ErrorAlert from './ErrorAlert.svelte'
  import TaskRow from './TaskRow.svelte'
  import TaskComposer from './TaskComposer.svelte'
  import EmptyState from './EmptyState.svelte'

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  let dialogEl = $state<HTMLDialogElement | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)

  let query = $state('')
  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let busy = $state(false)
  let searched = $state(false)
  let editing = $state<Task | null>(null)

  const labelFor = $derived(labelLookup(labels))

  function dateLabelFor(task: Task): string {
    return task.due_date ? formatShortDate(fromISODate(task.due_date)) : 'Inbox'
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  // Drop stale responses when a newer query has been issued.
  let token = 0

  $effect(() => {
    if (!dialogEl) return
    if (open) {
      if (!dialogEl.open) {
        dialogEl.showModal()
        onOpen()
      }
    } else if (dialogEl.open) {
      dialogEl.close()
    }
  })

  onDestroy(() => clearTimeout(timer))

  function onOpen() {
    reset()
    inputEl?.focus()
    void loadLabels()
  }

  function reset() {
    clearTimeout(timer)
    token++ // drop any in-flight request from a previous open
    query = ''
    tasks = []
    loading = false
    error = null
    searched = false
    editing = null
  }

  async function loadLabels() {
    try {
      labels = await api.labels.list()
    } catch {}
  }

  function onInput(event: Event) {
    query = (event.target as HTMLInputElement).value
    clearTimeout(timer)
    const current = ++token // invalidate any pending or in-flight request
    const term = query.trim()
    if (!term) {
      tasks = []
      searched = false
      loading = false
      error = null
      return
    }
    loading = true
    timer = setTimeout(() => runSearch(term, current), SEARCH_DEBOUNCE_MS)
  }

  async function runSearch(term: string, mine: number) {
    error = null
    try {
      const found = await api.search(term)
      if (mine !== token) return // a newer keystroke superseded this query
      tasks = found
      searched = true
    } catch (err) {
      if (mine !== token) return
      error = errorMessage(err, 'Could not run the search')
    } finally {
      if (mine === token) loading = false
    }
  }

  // Serialize overlay mutations because this view has no TaskCore.
  async function run(fn: () => Promise<void>, failMsg: string) {
    if (busy) return
    busy = true
    error = null
    try {
      await fn()
    } catch (err) {
      error = errorMessage(err, failMsg)
    } finally {
      busy = false
    }
  }

  function toggle(task: Task) {
    return run(async () => {
      tasks = replaceOccurrence(tasks, await toggleCompletion(task))
    }, 'Could not update the task')
  }

  function refresh() {
    const term = query.trim()
    if (term) void runSearch(term, ++token)
  }

  function saveEdit(input: TaskInput) {
    const target = editing
    if (!target) return
    return run(async () => {
      await api.tasks.update(target.id, input)
      editing = null
      refresh()
    }, 'Could not save the task')
  }

  function deleteEdit() {
    const target = editing
    if (!target) return
    return run(async () => {
      await api.tasks.remove(target.id)
      editing = null
      refresh()
    }, 'Could not delete the task')
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={onClose}
  class="mx-auto mt-[8vh] max-h-[84vh] w-[min(40rem,calc(100vw-1.5rem))] rounded-2xl border border-lichen bg-surface p-0 text-ink shadow-overlay"
>
  <div class="flex max-h-[84vh] flex-col">
    {#if editing}
      <div class="flex items-center gap-2 border-b border-lichen px-4 py-3">
        <button
          type="button"
          onclick={() => (editing = null)}
          aria-label="Back to results"
          class="-ml-1 shrink-0 rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
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
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 class="min-w-0 flex-1 truncate text-base font-semibold text-pine-deep">Edit task</h2>
        <button
          type="button"
          onclick={onClose}
          aria-label="Close search"
          class="-mr-1 shrink-0 rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
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
      </div>
    {:else}
      <div class="flex items-center gap-2 border-b border-lichen px-4">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5 shrink-0 text-sage"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-3.5-3.5" />
        </svg>
        <input
          bind:this={inputEl}
          value={query}
          oninput={onInput}
          type="search"
          placeholder="Search tasks…"
          autocomplete="off"
          aria-label="Search tasks"
          class="min-w-0 flex-1 bg-transparent py-3.5 text-base text-ink outline-none placeholder:text-sage"
        />
        <button
          type="button"
          onclick={onClose}
          aria-label="Close search"
          class="-mr-1 shrink-0 rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
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
      </div>
    {/if}

    <ErrorAlert {error} class="mx-4 mt-4" />

    <div class="flex-1 overflow-y-auto px-4 py-4">
      {#if editing}
        <TaskComposer
          {labels}
          {busy}
          initial={taskToDraft(editing)}
          submitLabel="Save"
          onSubmit={saveEdit}
          onDelete={deleteEdit}
          onCancel={() => (editing = null)}
        />
      {:else if loading}
        <p class="py-8 text-center text-sm text-sage">Searching…</p>
      {:else if !query.trim()}
        <EmptyState message="Start typing to search across all your tasks." />
      {:else if searched && tasks.length === 0}
        <EmptyState message={`No tasks match “${query.trim()}”.`} />
      {:else}
        <ul class="space-y-2">
          {#each tasks as task (`${task.id}:${task.occurrence_date ?? ''}`)}
            <li>
              <TaskRow
                {task}
                label={labelFor(task)}
                dateLabel={dateLabelFor(task)}
                onToggle={() => toggle(task)}
                onEdit={() => (editing = task)}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</dialog>

<style>
  dialog::backdrop {
    /* `--scrim` is the one chrome token kept fixed across themes (see app.css). */
    background: rgb(var(--scrim) / 0.42);
    backdrop-filter: blur(3px);
  }
  dialog[open] {
    animation: search-in 160ms ease-out;
  }
  @keyframes search-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog[open] {
      animation: none;
    }
  }
</style>
