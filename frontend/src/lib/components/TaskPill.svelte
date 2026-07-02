<script lang="ts">
  // One task in a month/week cell, rendered as its own label-colored pill (replaces
  // the old dot + title row). The label color is user data, NOT a theme token, so it
  // shows as a soft color tint so the label reads at a glance across the month — while
  // the title stays on the themed `ink` token, which keeps any
  // chosen color legible on the light OR dark cell ground (same safe approach as
  // LabelChip, no `dark:` classes).
  //
  // The pill carries a small round completion checkbox (same affordance as TaskRow), so
  // an occurrence can be ticked off straight from the calendar — `onToggle` runs the same
  // complete/uncomplete path the day sheet uses. A done occurrence fades + strikes through.
  //
  // Drag: when `draggable`, the ENTIRE pill is the drag handle AND the click-to-open
  // target — one element, so a press-and-drag anywhere on it moves the task while a plain
  // click/tap opens it. The checkbox is the only exception: it swallows the pointer/mouse/
  // touch start so ticking never starts a drag, and its click never bubbles to "open".
  // (The month/week grids that use this pill render only on wider screens — a phone shows
  // the compact dot-grid + readable agenda instead — so there is no slim-bar variant here.)
  import { dragHandle } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'

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
  // ~25% tint composited over the (light or dark) cell surface — enough colour to
  // recognize the label at a glance while `ink` text stays legible (no extra left
  // bar; the soft tint alone carries it). `40` is the 8-digit-hex alpha byte (~25%).
  const tintStyle = $derived(color ? `background-color:${color}40` : '')

  const openLabel = $derived(
    `${task.title}${task.due_time ? `, ${task.due_time}` : ''}${
      draggable ? ' — drag to move to another day' : ''
    }`,
  )
  const toggleLabel = $derived(`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`)

  // The whole pill is the drag handle when the task is movable; a no-op otherwise.
  // `draggable` is fixed per task for a given render, so reading it once at mount is
  // correct — the action never needs to react.
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

  // Keep the checkbox from ever starting a drag, whichever low-level start event the dnd
  // library listens for, without depending on which one it is.
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
  <!-- The whole pill: drag handle + open target in ONE element, so a drag starts anywhere
       on it and a plain click opens. The checkbox (a child) is the sole exception. -->
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
