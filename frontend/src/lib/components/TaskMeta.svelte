<script lang="ts">
  import type { Label, Task } from '../types'
  import { summarizeRule } from '../recurrence/describe'
  import Icon from './icons/Icon.svelte'
  import LabelChip from './LabelChip.svelte'

  let { task, label, dateLabel }: { task: Task; label?: Label; dateLabel?: string } = $props()
</script>

{#if dateLabel || task.due_time || label || task.recurrence_rule}
  <div class="mt-1 flex flex-wrap items-center gap-2">
    {#if dateLabel}
      <span class="inline-flex items-center gap-1 text-xs font-medium text-sage">
        <Icon class="h-3.5 w-3.5" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </Icon>
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
        <Icon class="h-3.5 w-3.5" strokeWidth={2}>
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </Icon>
        {summarizeRule(task.recurrence_rule)}
      </span>
    {/if}
    {#if label}
      <LabelChip {label} />
    {/if}
  </div>
{/if}
