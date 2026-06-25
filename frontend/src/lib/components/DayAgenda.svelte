<script lang="ts">
  // A day's tasks grouped by label — the readable single-day view when a month
  // cell is too small. Each label is a section header (the chip), with its tasks
  // below; tasks with no label fall under a trailing "No label" group. The chip
  // lives in the header, so rows omit it to avoid repeating it on every line.
  // Reused by the month's DaySheet and (later) the Today view. Read + complete.
  import type { Label, Task } from '../types'
  import { groupByLabel } from '../grouping'
  import LabelChip from './LabelChip.svelte'
  import TaskRow from './TaskRow.svelte'

  let {
    tasks,
    labels,
    onToggle,
  }: {
    tasks: Task[]
    labels: Label[]
    onToggle: (task: Task) => void
  } = $props()

  const groups = $derived(groupByLabel(tasks, labels))
</script>

{#if groups.length === 0}
  <p class="py-6 text-center text-sm text-sage">No tasks on this day.</p>
{:else}
  <div class="space-y-5">
    {#each groups as group (group.label ? group.label.id : 'none')}
      <section>
        <div class="mb-2 px-0.5">
          {#if group.label}
            <LabelChip name={group.label.name} color={group.label.color} />
          {:else}
            <span class="text-xs font-medium uppercase tracking-wide text-sage">No label</span>
          {/if}
        </div>
        <ul class="space-y-2">
          {#each group.tasks as task (`${task.id}:${task.occurrence_date ?? ''}`)}
            <li>
              <TaskRow {task} onToggle={() => onToggle(task)} />
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}
