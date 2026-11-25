<script lang="ts" module>
  import type { Label } from '../../lib/types'

  export type LabelListboxRow =
    { type: 'none' } | { type: 'label'; label: Label } | { type: 'create'; name: string }
</script>

<script lang="ts" generics="T extends LabelListboxRow">
  import LabelMark from '../../lib/components/LabelMark.svelte'
  import { POPOVER_CLASS } from '../../lib/constants'

  let {
    rows,
    active,
    anchor,
    onChoose,
    onDismiss,
    onHover,
    keepFocus = false,
    id,
  }: {
    rows: T[]
    active: number
    anchor: HTMLElement | null
    onChoose: (row: T) => void
    onDismiss: () => void
    onHover?: (index: number) => void
    keepFocus?: boolean
    id?: string
  } = $props()

  const rowKey = (row: LabelListboxRow) =>
    row.type === 'label' ? row.label.id : row.type === 'create' ? '+new' : 'none'

  function onWindowClick(event: MouseEvent) {
    if (anchor && event.target instanceof Node && !anchor.contains(event.target)) onDismiss()
  }

  function onWindowKey(event: KeyboardEvent) {
    if (event.key === 'Escape') onDismiss()
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<ul {id} role="listbox" class={POPOVER_CLASS}>
  {#each rows as row, i (rowKey(row))}
    <li>
      <button
        type="button"
        role="option"
        aria-selected={i === active}
        onpointerdown={(e) => {
          if (keepFocus) e.preventDefault()
        }}
        onclick={() => onChoose(row)}
        onmouseenter={() => onHover?.(i)}
        class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-pine/5 {i ===
        active
          ? 'bg-pine/5'
          : ''}"
      >
        {#if row.type === 'label'}
          <LabelMark label={row.label} look="option" />
        {:else if row.type === 'create'}
          <span class="grid h-2.5 w-2.5 shrink-0 place-items-center text-pine">＋</span>
          <span class="truncate text-sm text-pine-deep"
            >Create “<span class="font-medium">{row.name}</span>”</span
          >
        {:else}
          <span class="text-sm text-sage">None</span>
        {/if}
      </button>
    </li>
  {/each}
</ul>
