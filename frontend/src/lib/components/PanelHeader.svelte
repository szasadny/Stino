<script lang="ts">
  import IconButton from './IconButton.svelte'
  import Close from './icons/Close.svelte'

  let {
    title,
    subtitle,
    onClose,
    titleId,
    size = 'md',
  }: {
    title: string
    subtitle?: string
    onClose: () => void
    titleId?: string
    size?: 'sm' | 'md'
  } = $props()
</script>

<header
  class="flex items-start justify-between border-b border-lichen {size === 'sm'
    ? 'shrink-0 gap-3 px-4 py-3'
    : 'gap-4 px-5 py-4'}"
>
  <div>
    <h2
      id={titleId}
      class="font-display font-semibold tracking-tight text-pine-deep {size === 'sm'
        ? 'text-base'
        : 'text-xl'}"
    >
      {title}
    </h2>
    {#if subtitle}
      <p class="mt-0.5 text-sage {size === 'sm' ? 'text-xs' : 'text-sm'}">{subtitle}</p>
    {/if}
  </div>
  <IconButton label="Close" onclick={onClose} class="-mr-1 -mt-1 {size === 'sm' ? 'shrink-0' : ''}">
    <Close />
  </IconButton>
</header>
