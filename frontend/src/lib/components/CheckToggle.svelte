<script lang="ts">
  import { trustedClick } from '../dnd/tap'
  import { toggleTaskLabel } from '../messages'
  import Check from './icons/Check.svelte'

  let {
    checked,
    title,
    onToggle,
    size = 'md',
    nested = false,
    guardDrag = false,
    burst = false,
  }: {
    checked: boolean
    title: string
    onToggle: () => void
    size?: 'sm' | 'md'
    nested?: boolean
    guardDrag?: boolean
    burst?: boolean
  } = $props()

  const toggle = $derived(trustedClick(onToggle))

  function onclick(e: MouseEvent) {
    if (nested) e.stopPropagation()
    toggle(e)
  }

  // A press on the box must never start a drag of the row or pill around it.
  function swallowStart(e: Event) {
    if (guardDrag) e.stopPropagation()
  }
</script>

<button
  type="button"
  {onclick}
  onpointerdown={swallowStart}
  onmousedown={swallowStart}
  ontouchstart={swallowStart}
  role="checkbox"
  aria-checked={checked}
  aria-label={toggleTaskLabel(title, checked)}
  class="grid shrink-0 place-items-center rounded-full border transition {size === 'sm'
    ? 'h-3.5 w-3.5'
    : 'mt-px h-5 w-5 sm:mt-0 sm:self-center'} {checked
    ? 'border-pine bg-pine text-surface'
    : size === 'sm'
      ? 'border-sage/70 bg-surface/70 text-transparent hover:border-pine'
      : 'border-sage/60 text-transparent hover:border-pine'} {burst ? 'animate-check-burst' : ''}"
>
  {#if size === 'sm'}
    <Check class="h-2 w-2" strokeWidth={3.5} />
  {:else}
    <Check class="h-3 w-3 {burst ? 'animate-check-pop' : ''}" strokeWidth={2.5} />
  {/if}
</button>
