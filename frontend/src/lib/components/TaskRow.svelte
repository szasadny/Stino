<script lang="ts">
  // Reusable task row: a complete-toggle, the title, and a meta line (time +
  // label chip). View-specific actions (edit, delete, schedule) go in the
  // `trailing` snippet, and an optional `leading` snippet (e.g. a drag handle)
  // sits before the checkbox — so Inbox/Today/Day views reuse this same row.
  import type { Snippet } from 'svelte'
  import type { Label, Task } from '../types'
  import { summarizeRule } from '../recurrence'
  import LabelChip from './LabelChip.svelte'

  let {
    task,
    label,
    onToggle,
    leading,
    trailing,
  }: {
    task: Task
    label?: Label
    onToggle: () => void
    leading?: Snippet
    trailing?: Snippet
  } = $props()
</script>

<div
  class="flex items-start gap-3 rounded-xl border border-lichen bg-surface px-3 py-2.5 shadow-sm transition"
>
  {#if leading}
    <div class="mt-0.5 flex shrink-0 items-center self-stretch">
      {@render leading()}
    </div>
  {/if}
  <button
    type="button"
    onclick={onToggle}
    role="checkbox"
    aria-checked={task.completed}
    aria-label={task.completed ? 'Mark as not done' : 'Mark as done'}
    class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition {task.completed
      ? 'border-pine bg-pine text-surface'
      : 'border-sage/60 text-transparent hover:border-pine'}"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  </button>

  <div class="min-w-0 flex-1">
    <p
      class="break-words text-sm font-medium {task.completed
        ? 'text-sage line-through'
        : 'text-ink'}"
    >
      {task.title}
    </p>
    {#if task.due_time || label || task.recurrence_rule}
      <div class="mt-1 flex flex-wrap items-center gap-2">
        {#if task.due_time}
          <span class="text-xs font-medium tabular-nums text-sage">{task.due_time}</span>
        {/if}
        {#if task.recurrence_rule}
          <span
            class="inline-flex items-center gap-1 text-xs text-sage"
            title={summarizeRule(task.recurrence_rule)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            {summarizeRule(task.recurrence_rule)}
          </span>
        {/if}
        {#if label}
          <LabelChip name={label.name} color={label.color} />
        {/if}
      </div>
    {/if}
  </div>

  {#if trailing}
    <div class="flex shrink-0 items-center gap-1">
      {@render trailing()}
    </div>
  {/if}
</div>
