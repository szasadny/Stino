<script lang="ts">
  import { VIEWS } from './lib/constants'
  import type { ViewId } from './lib/types'

  let {
    current,
    onSelect,
    placement,
  }: { current: ViewId; onSelect: (view: ViewId) => void; placement: 'header' | 'bottom' } =
    $props()
</script>

{#if placement === 'header'}
  <nav class="ml-2 flex items-center gap-1">
    {#each VIEWS as view (view.id)}
      <button
        type="button"
        onclick={() => onSelect(view.id)}
        aria-current={current === view.id ? 'page' : undefined}
        class="rounded-full px-3.5 py-1.5 text-sm font-medium transition {current === view.id
          ? 'bg-pine/10 text-pine-deep ring-1 ring-pine/15'
          : 'text-sage hover:bg-pine/5 hover:text-pine-deep'}"
      >
        {view.label}
      </button>
    {/each}
  </nav>
{:else}
  <!-- Half the inset: the label clears the home indicator without a 34px empty band. -->
  <nav
    class="z-chrome flex shrink-0 border-t border-lichen/80 bg-surface/85 pb-[calc(env(safe-area-inset-bottom)/2)] backdrop-blur-md"
  >
    {#each VIEWS as view (view.id)}
      <button
        type="button"
        onclick={() => onSelect(view.id)}
        aria-current={current === view.id ? 'page' : undefined}
        class="relative min-h-11 flex-1 py-2.5 text-center text-xs font-medium transition {current ===
        view.id
          ? 'text-pine-deep'
          : 'text-sage'}"
      >
        {#if current === view.id}
          <span class="absolute inset-x-6 top-0 h-0.5 rounded-full bg-pine"></span>
        {/if}
        {view.label}
      </button>
    {/each}
  </nav>
{/if}
