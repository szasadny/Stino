<script lang="ts">
  import { labelColorVar } from '../../lib/labels'
  import type { Label, Task } from '../../lib/types'
  import TaskMeta from '../../lib/components/TaskMeta.svelte'
  import Check from '../../lib/components/icons/Check.svelte'

  let {
    task,
    label,
    selected,
    onSelect,
  }: { task: Task; label?: Label; selected: boolean; onSelect: () => void } = $props()

  const tint = $derived(labelColorVar(label?.color))
</script>

<button
  type="button"
  onclick={onSelect}
  role="checkbox"
  aria-checked={selected}
  class="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left shadow-soft transition {selected
    ? 'border-pine bg-pine/5'
    : tint
      ? 'label-tint border-lichen hover:border-pine/40'
      : 'border-lichen bg-surface hover:border-pine/40'}"
  style={selected ? '' : tint}
>
  <span
    class="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border transition sm:mt-0 sm:self-center {selected
      ? 'border-pine bg-pine text-surface'
      : 'border-sage/60 text-transparent'}"
  >
    <Check class="h-3 w-3" strokeWidth={2.5} />
  </span>
  <div class="min-w-0 flex-1">
    <p class="break-words text-sm font-medium text-ink">{task.title}</p>
    <TaskMeta {task} {label} />
  </div>
</button>
