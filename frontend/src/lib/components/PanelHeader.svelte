<script lang="ts">
  import type { Snippet } from 'svelte'
  import { DISPLAY_TITLE_CLASS } from '../constants'
  import { CLOSE } from '../messages'
  import IconButton from './IconButton.svelte'
  import Close from './icons/Close.svelte'

  let {
    title,
    subtitle,
    onClose,
    titleId,
    closeLabel = CLOSE,
    size = 'md',
    leading,
  }: {
    title: string
    subtitle?: string
    onClose: () => void
    titleId?: string
    closeLabel?: string
    size?: 'sm' | 'md'
    leading?: Snippet
  } = $props()
</script>

<header
  class="flex items-start justify-between border-b border-lichen {size === 'sm'
    ? 'shrink-0 gap-3 px-4 py-3'
    : 'gap-4 px-5 py-4'}"
>
  {@render leading?.()}
  <div class="min-w-0 flex-1">
    <h2 id={titleId} class="{DISPLAY_TITLE_CLASS} {size === 'sm' ? 'text-base' : 'text-xl'}">
      {title}
    </h2>
    {#if subtitle}
      <p class="mt-0.5 text-sage {size === 'sm' ? 'text-xs' : 'text-sm'}">{subtitle}</p>
    {/if}
  </div>
  <IconButton
    label={closeLabel}
    onclick={onClose}
    class="-mr-1 -mt-1 {size === 'sm' ? 'shrink-0' : ''}"
  >
    <Close />
  </IconButton>
</header>
