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
  //
  // `holdToDrag` adapts the row to be a phone press-and-hold drag target (the day
  // sheet): (1) the complete-toggle swallows the pointer/touch start so ticking never
  // arms a drag, and (2) the tap-to-edit surface renders as a `div role=button`, not a
  // `<button>` — svelte-dnd-action refuses to start a drag from an element with a
  // defined `.value` (every `<button>` has one), so the whole-row hold only works when
  // the tap surface is a plain element (the same reason TaskPill is a div). No-op
  // everywhere else (default false); wide screens keep the grip handle instead.
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
    holdToDrag = false,
    completing = false,
    slim = false,
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
    holdToDrag?: boolean
    // The Inbox completion send-off: render as done (filled circle + strike-through)
    // with the checkmark's pop animation while the row waits out its exit — the task
    // itself isn't `completed` yet (the write happens when the hold ends).
    completing?: boolean
    // One-line phone row for the day lists (week sections, month split agenda, Today):
    // a label-colour dot + truncated title + inline time, NO meta line (no recurrence
    // summary, no label chip) — the same at-a-glance line the phone month cells draw.
    slim?: boolean
    leading?: Snippet
    trailing?: Snippet
  } = $props()

  const done = $derived(task.completed || completing)

  // Keep the complete-toggle from arming a press-and-hold drag on the phone day-sheet,
  // whichever low-level start event the dnd library listens for (mirrors TaskPill).
  function guardToggleStart(e: Event) {
    if (holdToDrag) e.stopPropagation()
  }

  // Open the editor on Enter/Space when the tap surface is a `div role=button`.
  function editOnKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onEdit?.()
    }
  }
</script>

{#snippet content()}
  {#if slim}
    <div class="flex min-w-0 items-center gap-2">
      {#if label}
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          style="background-color: {label.color}"
          title={label.name}
        ></span>
      {/if}
      <span
        class="min-w-0 flex-1 truncate text-sm font-medium {done
          ? 'text-sage line-through'
          : 'text-ink'}"
      >
        {task.title}
      </span>
      {#if task.due_time}
        <span class="shrink-0 text-xs font-medium tabular-nums text-sage">{task.due_time}</span>
      {/if}
    </div>
  {:else}
    {@render fullContent()}
  {/if}
{/snippet}

{#snippet fullContent()}
  <p class="break-words text-sm font-medium {done ? 'text-sage line-through' : 'text-ink'}">
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
      class="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border transition sm:mt-0 sm:self-center {selected
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
      onpointerdown={guardToggleStart}
      onmousedown={guardToggleStart}
      ontouchstart={guardToggleStart}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? 'Mark as not done' : 'Mark as done'}
      class="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border transition sm:mt-0 sm:self-center {done
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
        class="h-3 w-3 {completing ? 'animate-check-pop' : ''}"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </button>

    {#if onEdit && holdToDrag}
      <!-- Phone hold-to-drag: the tap surface must be a plain element (not a <button>),
           or svelte-dnd-action won't start a drag from it. role/tabindex/keydown keep it
           a first-class button for a11y and keyboard. -->
      <div
        role="button"
        tabindex="0"
        onclick={onEdit}
        onkeydown={editOnKey}
        aria-label="Edit task"
        class="min-w-0 flex-1 cursor-pointer rounded-lg text-left transition hover:opacity-80"
      >
        {@render content()}
      </div>
    {:else if onEdit}
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
