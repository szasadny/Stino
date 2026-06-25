<script lang="ts">
  // Search: find any task by part of its title or notes. The query is debounced
  // client-side and hits GET /api/search; results are TaskRows you can complete
  // like anywhere else. Recurring tasks show as their series row — search is
  // about finding the task, not a specific occurrence. Edit lives in the Inbox.
  import { onMount, onDestroy } from 'svelte'
  import { api } from '../lib/api'
  import type { Label, Task } from '../lib/types'
  import { errorMessage } from '../lib/errors'
  import { labelLookup } from '../lib/labels'
  import { replaceOccurrence, toggleCompletion } from '../lib/task-actions'
  import TaskRow from '../lib/components/TaskRow.svelte'
  import EmptyState from '../lib/components/EmptyState.svelte'

  const DEBOUNCE_MS = 200

  let query = $state('')
  let tasks = $state<Task[]>([])
  let labels = $state<Label[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let busy = $state(false)
  // True once a search has run for the current term, so we can tell "haven't
  // typed yet" (prompt) apart from "searched, found nothing" (no results).
  let searched = $state(false)

  const labelFor = $derived(labelLookup(labels))

  let timer: ReturnType<typeof setTimeout> | undefined
  // A monotonic token bumped on every keystroke; a slow earlier response whose
  // token no longer matches is dropped, so results can't arrive out of order.
  let token = 0

  onMount(async () => {
    try {
      labels = await api.labels.list()
    } catch {
      // Labels are only decorative here (chips); a failure shouldn't block search.
    }
  })

  onDestroy(() => clearTimeout(timer))

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
    timer = setTimeout(() => runSearch(term, current), DEBOUNCE_MS)
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
    <h1 class="text-xl font-semibold text-pine-deep">Search</h1>
    <p class="mt-1 text-sm text-sage">Find any task by part of its title or notes.</p>
  </header>

  {#if error}
    <p
      role="alert"
      class="mt-4 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark"
    >
      {error}
    </p>
  {/if}

  <!-- Search box -->
  <div
    class="mt-5 flex items-center gap-2 rounded-xl border border-lichen bg-surface px-3 shadow-sm"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4 shrink-0 text-sage"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-3.5-3.5" />
    </svg>
    <input
      value={query}
      oninput={onInput}
      type="search"
      placeholder="Search tasks…"
      autocomplete="off"
      aria-label="Search tasks"
      class="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-sage"
    />
  </div>

  <!-- Results -->
  <div class="mt-5">
    {#if loading}
      <p class="py-8 text-center text-sm text-sage">Searching…</p>
    {:else if !query.trim()}
      <EmptyState message="Type above to search across all your tasks." />
    {:else if searched && tasks.length === 0}
      <EmptyState message={`No tasks match “${query.trim()}”.`} />
    {:else}
      <ul class="space-y-2">
        {#each tasks as task (`${task.id}:${task.occurrence_date ?? ''}`)}
          <li>
            <TaskRow {task} label={labelFor(task)} onToggle={() => toggle(task)} />
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
