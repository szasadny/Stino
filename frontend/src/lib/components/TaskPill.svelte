<script lang="ts">
  // One task in a month/week cell as its own label-colored pill. The label color is user data
  // (a soft tint), the title stays on the themed `ink` token so it's legible on either cell
  // ground (like LabelChip, no `dark:` classes). A round checkbox ticks the occurrence off
  // straight from the calendar via `onToggle`. When `draggable`, the entire pill is both the
  // drag handle and the click-to-open target; the checkbox is the exception, swallowing the
  // pointer start so ticking never starts a drag. Desktop grids only (a phone uses the
  // compact cell + agenda).
  import { dragHandle } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import { labelTint } from '../labels'

  let {
    task,
    label,
    draggable = false,
    onOpen,
    onToggle,
  }: {
    task: Task
    label: Label | undefined
    draggable?: boolean
    onOpen: () => void
    onToggle?: (task: Task) => void
  } = $props()

  const color = $derived(label?.color ?? null)
  // Soft label-colour wash over the cell surface (shared recipe — see labelTint).
  const tintStyle = $derived(labelTint(color))

  const openLabel = $derived(
    `${task.title}${task.due_time ? `, ${task.due_time}` : ''}${
      draggable ? ' — drag to move to another day' : ''
    }`,
  )
  const toggleLabel = $derived(`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`)

  // The whole pill is the drag handle when movable; `draggable` is fixed per render, so
  // reading it once at mount is correct.
  function dragHandleIf(node: HTMLElement) {
    if (draggable) return dragHandle(node)
  }

  // Open on a plain click/Enter/Space (svelte-dnd-action suppresses the click that ends a
  // real drag, so this only fires on a true tap).
  function openOnKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  // Keep the checkbox from ever starting a drag, whichever low-level start event fires.
  function swallowStart(e: Event) {
    e.stopPropagation()
  }
</script>

{#snippet checkbox()}
  <button
    type="button"
    onclick={(e) => {
      e.stopPropagation()
      onToggle?.(task)
    }}
    onpointerdown={swallowStart}
    onmousedown={swallowStart}
    ontouchstart={swallowStart}
    role="checkbox"
    aria-checked={task.completed}
    aria-label={toggleLabel}
    class="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border transition {task.completed
      ? 'border-pine bg-pine text-surface'
      : 'border-sage/70 bg-surface/70 text-transparent hover:border-pine'}"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-2 w-2"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  </button>
{/snippet}

{#snippet pill()}
  <!-- The whole pill: drag handle + open target in one element. The checkbox is the exception. -->
  <div
    use:dragHandleIf
    role="button"
    tabindex="0"
    onclick={onOpen}
    onkeydown={openOnKey}
    aria-label={openLabel}
    class="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left {color
      ? ''
      : 'bg-pine/10'} {task.completed ? 'opacity-60' : ''} {draggable
      ? 'cursor-grab active:cursor-grabbing'
      : 'cursor-pointer'}"
    style={tintStyle}
  >
    {#if onToggle}
      {@render checkbox()}
    {/if}
    {#if task.due_time}
      <span class="shrink-0 text-[10px] font-medium tabular-nums text-sage">{task.due_time}</span>
    {/if}
    <span
      class="truncate text-[11px] leading-tight text-ink {task.completed ? 'line-through' : ''}"
    >
      {task.title}
    </span>
  </div>
{/snippet}

{@render pill()}
