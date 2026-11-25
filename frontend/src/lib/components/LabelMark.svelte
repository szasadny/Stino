<script lang="ts">
  import { labelColorVar } from '../labels'
  import type { Label } from '../types'

  const LOOKS = {
    chip: { dot: 'h-2 w-2', emoji: 'shrink-0 text-sm', name: 'truncate' },
    option: { dot: 'h-2.5 w-2.5', emoji: 'shrink-0 text-base', name: 'truncate text-sm text-ink' },
    toggle: { dot: 'h-2.5 w-2.5', emoji: '', name: '' },
  }

  let {
    label,
    look,
  }: { label: Pick<Label, 'name' | 'color' | 'emoji'>; look: keyof typeof LOOKS } = $props()

  const classes = $derived(LOOKS[look])
</script>

<span class="label-dot {classes.dot} shrink-0 rounded-full" style={labelColorVar(label.color)}
></span>
{#if label.emoji}
  <span class="{classes.emoji} leading-none" aria-hidden="true">{label.emoji}</span>
{/if}
<span class={classes.name}>{label.name}</span>
