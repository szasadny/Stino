<script lang="ts">
  // Reusable task row: a complete-toggle, the title, and a meta line. View-specific actions
  // go in the `trailing` snippet; an optional `leading` snippet (e.g. a drag handle) sits
  // before the checkbox. `onEdit` makes the title/meta a button that opens the editor.
  // `dateLabel` adds the planned day (Search spans every day, so it passes one). In
  // `selectable` mode (Inbox multi-select) the toggle becomes a square checkbox and the whole
  // row calls `onSelect`.
  //
  // `holdToDrag` makes the row a phone press-and-hold drag target: the toggle swallows the
  // pointer start so ticking never arms a drag, and the tap-to-edit surface renders as a
  // `div role=button`, not a `<button>` — svelte-dnd-action refuses to start a drag from an
  // element with a defined `.value` (every `<button>` has one; same reason TaskPill is a div).
  import type { Snippet } from 'svelte'
  import type { Label, Task } from '../types'
  import { summarizeRule } from '../recurrence'
  import { labelTint } from '../labels'
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
    // Render as done (filled circle + strike-through) while the Inbox row waits out its exit;
    // the task itself isn't `completed` yet (the write happens when the hold ends).
    completing?: boolean
    // One-line phone row for the day lists: title + inline time, no meta line.
    slim?: boolean
    leading?: Snippet
    trailing?: Snippet
  } = $props()

  const done = $derived(task.completed || completing)
  const tint = $derived(labelTint(label?.color))

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
    <!-- One line, no dot: the row's own label-colour wash carries the label. -->
    <div class="flex min-w-0 items-center gap-2">
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
  <!-- While completing, the strike is the ANIMATED line (strike-draw) instead of the
       static text-decoration, so the two never double up. -->
  <p
    class="break-words text-sm font-medium transition-colors duration-300 {task.completed
      ? 'text-sage line-through'
      : completing
        ? 'text-sage'
        : 'text-ink'}"
  >
    <span class={completing ? 'strike-draw' : ''}>{task.title}</span>
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
      : tint
        ? 'border-lichen hover:border-pine/40'
        : 'border-lichen bg-surface hover:border-pine/40'}"
    style={selected ? '' : tint}
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
    class="flex items-start gap-3 rounded-xl border px-3 py-2.5 shadow-soft transition {completing
      ? 'border-pine/40 bg-pine/5'
      : tint
        ? 'border-lichen hover:border-pine/30'
        : 'border-lichen bg-surface hover:border-pine/30'}"
    style={completing ? '' : tint}
  >
    {#if leading}
      <div class="flex shrink-0 items-center self-stretch">
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
        : 'border-sage/60 text-transparent hover:border-pine'} {completing
        ? 'animate-check-burst'
        : ''}"
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
      <!-- Phone hold-to-drag: the tap surface must be a plain element, not a <button>, or
           svelte-dnd-action won't start a drag from it; role/tabindex/keydown restore a11y. -->
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
