<script lang="ts">
  import { labelColorVar } from '../labels'
  import type { Label } from '../types'

  const LOOKS = {
    chip: { dot: 'h-2 w-2', emoji: 'text-sm', name: 'truncate' },
    option: { dot: 'h-2.5 w-2.5', emoji: 'text-base', name: 'truncate text-sm text-ink' },
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
  <!-- Fixed box and emoji font: a text-variant glyph such as the heart otherwise spaces differently per device. -->
  <span
    class="{classes.emoji} inline-grid w-[1.25em] shrink-0 place-items-center font-emoji leading-none"
    aria-hidden="true">{label.emoji}</span
  >
{/if}
<span class={classes.name}>{label.name}</span>
