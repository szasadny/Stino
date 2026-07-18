<script lang="ts">
  // The checkbox must swallow pointer-start events so ticking never starts a drag.
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
  const tintStyle = $derived(labelTint(color))

  const openLabel = $derived(
    `${task.title}${task.due_time ? `, ${task.due_time}` : ''}${
      draggable ? ' — drag to move to another day' : ''
    }`,
  )
  const toggleLabel = $derived(`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`)

  function dragHandleIf(node: HTMLElement) {
    if (draggable) return dragHandle(node)
  }

  function openOnKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

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
