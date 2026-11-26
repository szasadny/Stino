<script lang="ts">
  import type { Snippet } from 'svelte'
  import { DISPLAY_TITLE_CLASS } from '../constants'

  let {
    title,
    subtitle,
    nowrap = false,
    class: className = '',
    status,
    actions,
  }: {
    title: string
    subtitle?: string
    nowrap?: boolean
    class?: string
    status?: Snippet
    actions?: Snippet
  } = $props()
</script>

<header
  class="flex shrink-0 justify-between {subtitle == null
    ? 'items-center'
    : 'items-start'} {className}"
>
  <div>
    <div class="flex items-baseline gap-2">
      <h1 class="{DISPLAY_TITLE_CLASS} text-xl {nowrap ? 'whitespace-nowrap' : ''} sm:text-2xl">
        {title}
      </h1>
      {@render status?.()}
    </div>
    {#if subtitle != null}
      <p class="mt-1 min-h-5 text-sm text-sage">{subtitle}</p>
    {/if}
  </div>
  {@render actions?.()}
</header>
