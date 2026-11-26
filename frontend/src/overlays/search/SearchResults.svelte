<script lang="ts">
  import EmptyState from '../../lib/components/EmptyState.svelte'
  import TaskRow from '../../lib/components/TaskRow.svelte'
  import { MUTED_CENTER_CLASS } from '../../lib/constants'
  import { taskDateLabel } from '../../lib/format'
  import { noSearchMatch, SEARCH_PROMPT, SEARCHING } from '../../lib/messages'
  import { isRecurring, occurrenceKey } from '../../lib/tasks/predicates'
  import type { Search } from './search.svelte'

  let { search }: { search: Search } = $props()

  const term = $derived(search.query.trim())
</script>

{#if !term}
  <EmptyState message={SEARCH_PROMPT} />
{:else if search.results.length > 0}
  <ul
    aria-busy={search.stale}
    class="space-y-2 transition-opacity motion-reduce:transition-none"
    class:opacity-60={search.stale}
  >
    {#each search.results as task (occurrenceKey(task))}
      {@const series = isRecurring(task)}
      <li>
        <!-- Occurrences of a recurring task are completed from the calendar. -->
        <TaskRow
          task={series ? { ...task, completed: false } : task}
          label={search.core.labelFor(task)}
          dateLabel={taskDateLabel(task)}
          onToggle={series ? undefined : () => void search.toggle(task)}
          onEdit={() => search.edit(task)}
        />
      </li>
    {/each}
  </ul>
{:else if search.loading}
  <p class="{MUTED_CENTER_CLASS} py-8">{SEARCHING}</p>
{:else if search.searched}
  <EmptyState message={noSearchMatch(term)} />
{/if}
