<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from './lib/api'
  import { VIEWS, type ViewId } from './lib/constants'
  import Cairn from './lib/components/Cairn.svelte'
  import LabelManager from './lib/components/LabelManager.svelte'
  import MonthView from './views/MonthView.svelte'
  import WeekView from './views/WeekView.svelte'
  import TodayView from './views/TodayView.svelte'
  import InboxView from './views/InboxView.svelte'
  import SearchView from './views/SearchView.svelte'

  const VIEW_COMPONENTS = {
    month: MonthView,
    week: WeekView,
    today: TodayView,
    inbox: InboxView,
    search: SearchView,
  }

  let current = $state<ViewId>('month')
  let connected = $state<boolean | null>(null)
  let labelsOpen = $state(false)
  const Active = $derived(VIEW_COMPONENTS[current])

  onMount(async () => {
    try {
      const health = await api.health()
      connected = health.status === 'ok' && health.db
    } catch {
      connected = false
    }
  })
</script>

<div class="flex min-h-screen flex-col">
  <header
    class="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-lichen bg-surface/85 px-4 backdrop-blur-sm"
  >
    <div class="flex items-center gap-2">
      <Cairn class="h-7 w-7 text-pine" />
      <span class="text-lg font-semibold tracking-tight text-pine-deep">Stinō</span>
    </div>

    <nav class="ml-2 hidden items-center gap-1 md:flex">
      {#each VIEWS as view (view.id)}
        <button
          type="button"
          onclick={() => (current = view.id)}
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition {current === view.id
            ? 'bg-pine/10 text-pine'
            : 'text-sage hover:text-pine-deep'}"
        >
          {view.label}
        </button>
      {/each}
    </nav>

    <div class="ml-auto flex items-center gap-1">
      <button
        type="button"
        onclick={() => (labelsOpen = true)}
        aria-haspopup="dialog"
        class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path
            d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"
          />
          <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
        </svg>
        <span class="hidden sm:inline">Labels</span>
      </button>

      <div class="flex items-center gap-2 pl-1 text-xs text-sage">
        <span
          class="h-2 w-2 rounded-full {connected
            ? 'bg-moss'
            : connected === false
              ? 'bg-bark'
              : 'bg-lichen'}"
          aria-hidden="true"
        ></span>
        <span class="hidden sm:inline">
          {connected ? 'Connected' : connected === false ? 'Offline' : 'Connecting…'}
        </span>
      </div>
    </div>
  </header>

  <main class="flex-1 pb-20 md:pb-8">
    <Active />
  </main>

  <nav
    class="fixed inset-x-0 bottom-0 z-20 flex border-t border-lichen bg-surface/95 backdrop-blur-sm md:hidden"
  >
    {#each VIEWS as view (view.id)}
      <button
        type="button"
        onclick={() => (current = view.id)}
        class="flex-1 py-2.5 text-center text-xs font-medium transition {current === view.id
          ? 'text-pine'
          : 'text-sage'}"
      >
        {view.label}
      </button>
    {/each}
  </nav>

  <LabelManager open={labelsOpen} onClose={() => (labelsOpen = false)} />
</div>
