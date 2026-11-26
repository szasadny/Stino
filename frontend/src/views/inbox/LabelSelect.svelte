<script lang="ts">
  import { COMPACT_INPUT_CLASS } from '../../lib/constants'
  import { NO_LABEL } from '../../lib/messages'
  import type { Label } from '../../lib/types'
  import LabelChip from '../../lib/components/LabelChip.svelte'
  import Chevron from '../../lib/components/icons/Chevron.svelte'
  import LabelListbox, { type LabelListboxRow } from './LabelListbox.svelte'

  let {
    labels,
    value,
    onChange,
    id,
  }: {
    labels: Label[]
    value: number | null
    onChange: (id: number | null) => void
    id: string
  } = $props()

  let open = $state(false)
  let container = $state<HTMLDivElement | null>(null)

  const selected = $derived(labels.find((l) => l.id === value) ?? null)
  const rows = $derived<LabelListboxRow[]>([
    { type: 'none' },
    ...labels.map((label): LabelListboxRow => ({ type: 'label', label })),
  ])
  const active = $derived(
    rows.findIndex((row) => (row.type === 'label' ? row.label.id : null) === value),
  )

  function choose(row: LabelListboxRow) {
    onChange(row.type === 'label' ? row.label.id : null)
    open = false
  }
</script>

<div class="relative" bind:this={container}>
  <button
    {id}
    type="button"
    onclick={() => (open = !open)}
    aria-haspopup="listbox"
    aria-expanded={open}
    class="flex w-full items-center justify-between gap-2 {COMPACT_INPUT_CLASS}"
  >
    {#if selected}
      <LabelChip label={selected} />
    {:else}
      <span class="text-sage">{NO_LABEL}</span>
    {/if}
    <Chevron dir="down" class="h-4 w-4 shrink-0 text-sage transition {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <LabelListbox
      {rows}
      {active}
      anchor={container}
      onChoose={choose}
      onDismiss={() => (open = false)}
    />
  {/if}
</div>
