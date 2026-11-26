<script lang="ts">
  import Plus from './icons/Plus.svelte'

  let {
    onAdd,
    label,
    alwaysOnMobile = false,
    class: className = '',
  }: {
    onAdd: () => void
    label: string
    alwaysOnMobile?: boolean
    class?: string
  } = $props()

  const reveal = $derived(
    alwaysOnMobile
      ? 'grid sm:opacity-0 sm:group-hover:opacity-100'
      : 'hidden opacity-0 group-hover:opacity-100 sm:grid',
  )
</script>

<button
  type="button"
  onclick={onAdd}
  aria-label={label}
  class="h-6 w-6 shrink-0 place-items-center rounded-full text-sage transition hover:bg-pine/10 hover:text-pine-deep focus-visible:opacity-100 {reveal} {className}"
>
  <Plus class="h-3.5 w-3.5" />
</button>
