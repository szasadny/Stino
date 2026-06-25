<script lang="ts">
  // Reusable task row: a complete-toggle, the title, and a meta line (time +
  // label chip). View-specific actions (edit, delete, schedule) go in the
  // `trailing` snippet, and an optional `leading` snippet (e.g. a drag handle)
  // sits before the checkbox — so Inbox/Today/Day views reuse this same row.
  // When `onEdit` is given, the title/meta become a button that opens the editor
  // (tap a task to edit it); the complete-toggle stays its own separate control.
  // `dateLabel` adds the planned day to the meta line — most views imply the day
  // from their context, but Search spans every day, so it passes one.
  //
  // In `selectable` mode (the Inbox multi-select) the round complete-toggle is
  // swapped for a square selection checkbox and the whole row becomes one button
  // that calls `onSelect`; `leading`/`trailing` are omitted by the caller.
  import type { Snippet } from 'svelte'
  import type { Label, Task } from '../types'
  import { summarizeRule } from '../recurrence'
  import LabelChip from './LabelChip.svelte'

  let {
    task,
    label,
    dateLabel,
    onToggle,
    onEdit,
    selectable = false,
    selected = false,
    onSelect,
    leading,
    trailing,
  }: {
    task: Task
    label?: Label
    dateLabel?: string
    onToggle?: () => void
    onEdit?: () => void
    selectable?: boolean
    selected?: boolean
    onSelect?: () => void
    leading?: Snippet
    trailing?: Snippet
  } = $props()
</script>

{#snippet content()}
  <p
    class="break-words text-sm font-medium {task.completed ? 'text-sage line-through' : 'text-ink'}"
  >
    {task.title}
  </p>
  {#if dateLabel || task.due_time || label || task.recurrence_rule}
    <div class="mt-1 flex flex-wrap items-center gap-2">
      {#if dateLabel}
        <span class="inline-flex items-center gap-1 text-xs font-medium text-sage">
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
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {dateLabel}
        </span>
      {/if}
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
        <LabelChip name={label.name} color={label.color} emoji={label.emoji} />
      {/if}
    </div>
  {/if}
{/snippet}

{#if selectable}
  <button
    type="button"
    onclick={onSelect}
    role="checkbox"
    aria-checked={selected}
    class="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left shadow-soft transition {selected
      ? 'border-pine bg-pine/5'
      : 'border-lichen bg-surface hover:border-pine/40'}"
  >
    <span
      class="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border transition {selected
        ? 'border-pine bg-pine text-surface'
        : 'border-sage/60 text-transparent'}"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3 w-3"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
    <div class="min-w-0 flex-1">
      {@render content()}
    </div>
  </button>
{:else}
  <div
    class="flex items-start gap-3 rounded-xl border border-lichen bg-surface px-3 py-2.5 shadow-soft transition hover:border-pine/30"
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
      class="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border transition {task.completed
        ? 'border-pine bg-pine text-surface'
        : 'border-sage/60 text-transparent hover:border-pine'}"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3 w-3"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </button>

    {#if onEdit}
      <button
        type="button"
        onclick={onEdit}
        aria-label="Edit task"
        class="min-w-0 flex-1 rounded-lg text-left transition hover:opacity-80"
      >
        {@render content()}
      </button>
    {:else}
      <div class="min-w-0 flex-1">
        {@render content()}
      </div>
    {/if}

    {#if trailing}
      <div class="flex shrink-0 items-center gap-1">
        {@render trailing()}
      </div>
    {/if}
  </div>
{/if}
