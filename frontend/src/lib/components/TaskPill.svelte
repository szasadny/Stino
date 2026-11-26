<script lang="ts">
  import { dragHandle } from 'svelte-dnd-action'
  import type { Task } from '../types'
  import { getCalendarContext } from '../controllers/calendar-context'
  import { labelTint } from '../labels'
  import { activateOnKey, trustedClick } from '../dnd/tap'
  import { openTaskPillLabel } from '../messages'
  import CheckToggle from './CheckToggle.svelte'

  let {
    task,
    draggable = false,
    wrap = false,
  }: { task: Task; draggable?: boolean; wrap?: boolean } = $props()

  const { core, composer } = getCalendarContext()
  const onOpen = () => composer.edit(task)
  const tint = $derived(labelTint(core.labelFor(task)?.color, 'bg-pine/10'))

  const openLabel = $derived(openTaskPillLabel(task.title, task.due_time, draggable))

  function dragHandleIf(node: HTMLElement) {
    return draggable ? dragHandle(node) : undefined
  }
</script>

<div
  use:dragHandleIf
  role="button"
  tabindex="0"
  onclick={trustedClick(onOpen)}
  onkeydown={activateOnKey(onOpen)}
  aria-label={openLabel}
  class="flex min-w-0 {wrap
    ? 'items-start'
    : 'items-center'} gap-1 rounded-md px-1 py-0.5 text-left {tint.class} {task.completed
    ? 'opacity-60'
    : ''} {draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}"
  style={tint.style}
>
  <CheckToggle
    checked={task.completed}
    title={task.title}
    onToggle={() => core.toggle(task)}
    size="sm"
    nested
    guardDrag
  />
  {#if task.due_time}
    <span class="shrink-0 text-3xs font-medium tabular-nums text-sage">{task.due_time}</span>
  {/if}
  <span
    class="{wrap
      ? 'min-w-0 break-words'
      : 'truncate'} text-2xs leading-tight text-ink {task.completed ? 'line-through' : ''}"
  >
    {task.title}
  </span>
</div>
