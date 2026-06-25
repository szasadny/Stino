<script lang="ts">
  // The small colored dot that marks a task in the calendar cells: the label's
  // color, or pine for an unlabeled task, dimmed when the task is done. Shared by
  // CalendarCell and WeekDayCell so the markup lives in one place.
  import type { Label, Task } from '../types'

  let { task, label }: { task: Task; label: Label | undefined } = $props()
</script>

{#if label}
  <span
    class="h-1.5 w-1.5 shrink-0 rounded-full {task.completed ? 'opacity-40' : ''}"
    style="background-color: {label.color}"
  ></span>
{:else}
  <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-pine/60 {task.completed ? 'opacity-40' : ''}"
  ></span>
{/if}
