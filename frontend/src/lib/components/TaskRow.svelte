<script lang="ts">
  // `holdToDrag` edits via a role-button surface: svelte-dnd-action won't drag a native button.
  import type { Snippet } from 'svelte'
  import type { Label, Task } from '../types'
  import { TASK_CARD_CLASS } from '../constants'
  import { labelTint } from '../labels'
  import { activateOnKey, trustedClick } from '../dnd/tap'
  import { editTaskLabel } from '../messages'
  import CheckToggle from './CheckToggle.svelte'
  import TaskMeta from './TaskMeta.svelte'

  let {
    task,
    label,
    dateLabel,
    onToggle,
    onEdit,
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
    holdToDrag?: boolean
    completing?: boolean
    slim?: boolean
    leading?: Snippet
    trailing?: Snippet
  } = $props()

  const done = $derived(task.completed || completing)
  const tint = $derived(labelTint(label?.color, 'bg-surface'))
</script>

{#snippet content()}
  {#if slim}
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
    <!-- Animated strike is separate so it does not double the static decoration. -->
    <p
      class="break-words text-sm font-medium transition-colors duration-300 {task.completed
        ? 'text-sage line-through'
        : completing
          ? 'text-sage'
          : 'text-ink'}"
    >
      <span class={completing ? 'strike-draw' : ''}>{task.title}</span>
    </p>
    <TaskMeta {task} {label} {dateLabel} />
  {/if}
{/snippet}

<div
  class="{TASK_CARD_CLASS} {completing
    ? 'border-pine/40 bg-pine/5'
    : `${tint.class} border-lichen hover:border-pine/40`}"
  style={completing ? '' : tint.style}
>
  {#if leading}
    <div class="flex shrink-0 items-center self-stretch">
      {@render leading()}
    </div>
  {/if}
  {#if onToggle}
    <CheckToggle
      checked={done}
      title={task.title}
      {onToggle}
      guardDrag={holdToDrag}
      burst={completing}
    />
  {:else}
    <span class="mt-px h-5 w-5 shrink-0 sm:mt-0 sm:self-center" aria-hidden="true"></span>
  {/if}

  {#if onEdit && holdToDrag}
    <div
      role="button"
      tabindex="0"
      onclick={trustedClick(onEdit)}
      onkeydown={activateOnKey(onEdit)}
      aria-label={editTaskLabel(task.title)}
      class="min-w-0 flex-1 cursor-pointer rounded-lg text-left transition hover:opacity-80"
    >
      {@render content()}
    </div>
  {:else if onEdit}
    <button
      type="button"
      onclick={onEdit}
      aria-label={editTaskLabel(task.title)}
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
