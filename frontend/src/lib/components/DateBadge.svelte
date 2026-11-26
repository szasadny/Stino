<script lang="ts">
  import type { Attachment } from 'svelte/attachments'

  let {
    date,
    isToday,
    muted = false,
    size = 'md',
    label,
    onclick,
    ...attachments
  }: {
    date: Date
    isToday: boolean
    muted?: boolean
    size?: 'sm' | 'md'
    label?: string
    onclick?: () => void
    [key: symbol]: Attachment<HTMLButtonElement> | false | null | undefined
  } = $props()

  const base = $derived(
    `grid place-items-center rounded-full font-semibold tabular-nums ${
      size === 'sm' ? 'h-5 w-5 shrink-0 text-2xs' : 'h-6 w-6 text-xs'
    } ${isToday ? 'bg-pine text-surface' : muted ? 'text-sage/60' : 'text-ink'}`,
  )
</script>

{#if onclick}
  <button
    type="button"
    {onclick}
    aria-label={label}
    {...attachments}
    class="{base} transition {isToday
      ? 'hover:bg-pine-deep'
      : 'hover:bg-pine/10 hover:text-pine-deep'}"
  >
    {date.getDate()}
  </button>
{:else}
  <span class={base}>{date.getDate()}</span>
{/if}
