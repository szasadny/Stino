<script lang="ts" module>
  export const optionId = (listboxId: string, index: number) => `${listboxId}-option-${index}`
</script>

<script lang="ts">
  import LabelMark from '../../lib/components/LabelMark.svelte'
  import { POPOVER_CLASS } from '../../lib/constants'
  import { CREATE, LABELS } from '../../lib/messages'
  import type { LabelSuggestion } from '../../lib/quickadd'

  let {
    id,
    rows,
    active,
    anchor,
    onChoose,
    onHover,
    onDismiss,
  }: {
    id: string
    rows: LabelSuggestion[]
    active: number
    anchor: HTMLElement | null
    onChoose: (row: LabelSuggestion) => void
    onHover: (index: number) => void
    onDismiss: () => void
  } = $props()

  const rowKey = (row: LabelSuggestion) => (row.type === 'label' ? row.label.id : '+new')

  let list = $state<HTMLUListElement | null>(null)

  // Delegated: options never take focus, so they get no key handlers of their own.
  function onWindowClick(event: MouseEvent) {
    if (!(event.target instanceof Element)) return
    const option = event.target.closest('[role="option"]')
    const row =
      option && list?.contains(option) ? rows[Number(option.getAttribute('data-index'))] : undefined
    if (row) onChoose(row)
    else if (anchor && !anchor.contains(event.target)) onDismiss()
  }
</script>

<svelte:window onclick={onWindowClick} />

<ul bind:this={list} {id} role="listbox" aria-label={LABELS} class={POPOVER_CLASS}>
  {#each rows as row, i (rowKey(row))}
    <li
      id={optionId(id, i)}
      role="option"
      aria-selected={i === active}
      data-index={i}
      onpointerdown={(e) => e.preventDefault()}
      onmouseenter={() => onHover(i)}
      class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition hover:bg-pine/5 {i ===
      active
        ? 'bg-pine/5'
        : ''}"
    >
      {#if row.type === 'label'}
        <LabelMark label={row.label} look="option" />
      {:else}
        <span class="grid h-2.5 w-2.5 shrink-0 place-items-center text-pine">＋</span>
        <span class="truncate text-sm text-pine-deep"
          >{CREATE} “<span class="font-medium">{row.name}</span>”</span
        >
      {/if}
    </li>
  {/each}
</ul>
