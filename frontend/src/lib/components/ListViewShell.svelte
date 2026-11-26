<script lang="ts">
  import type { Snippet } from 'svelte'
  import { MUTED_CENTER_CLASS } from '../constants'
  import { dragEdgeScroll } from '../dnd/drag-scroll.action'
  import { LOADING } from '../messages'
  import EmptyState from './EmptyState.svelte'
  import ErrorAlert from './ErrorAlert.svelte'
  import PageHeader from './PageHeader.svelte'

  let {
    title,
    subtitle,
    error,
    loading,
    empty,
    emptyMessage,
    edgeScroll = false,
    actions,
    top,
    overlay,
    children,
  }: {
    title: string
    subtitle: string
    error: string | null
    loading: boolean
    empty: boolean
    emptyMessage: string
    edgeScroll?: boolean
    actions?: Snippet
    top?: Snippet
    overlay?: Snippet
    children: Snippet
  } = $props()

  function scroll(node: HTMLElement, enabled: boolean) {
    return enabled ? dragEdgeScroll(node) : undefined
  }
</script>

<section class="relative mx-auto flex h-full w-full max-w-2xl flex-col px-4">
  <PageHeader {title} {subtitle} {actions} class="gap-3 pt-6 sm:pt-8" />

  <ErrorAlert {error} class="mt-4" />

  {@render top?.()}

  <div class="mt-5 min-h-0 flex-1 overflow-y-auto pb-6" use:scroll={edgeScroll}>
    {#if loading}
      <p class="{MUTED_CENTER_CLASS} py-8">{LOADING}</p>
    {:else if empty}
      {#if !error}
        <EmptyState message={emptyMessage} />
      {/if}
    {:else}
      {@render children()}
    {/if}
  </div>

  {@render overlay?.()}
</section>
