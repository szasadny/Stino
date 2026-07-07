<script lang="ts">
  import { onMount } from 'svelte'
  import { VIEWS, type ViewId } from './lib/constants'
  import { api } from './lib/api'
  import { toISODate } from './lib/date'
  import { bumpRefresh } from './lib/refresh.svelte'
  import Cairn from './lib/components/Cairn.svelte'
  import LabelManager from './lib/components/LabelManager.svelte'
  import ImportDialog from './lib/components/ImportDialog.svelte'
  import SettingsDialog from './lib/components/SettingsDialog.svelte'
  import SearchDialog from './lib/components/SearchDialog.svelte'
  import MonthView from './views/MonthView.svelte'
  import WeekView from './views/WeekView.svelte'
  import TodayView from './views/TodayView.svelte'
  import InboxView from './views/InboxView.svelte'

  const VIEW_COMPONENTS = {
    month: MonthView,
    week: WeekView,
    today: TodayView,
    inbox: InboxView,
  }

  let current = $state<ViewId>('month')
  let searchOpen = $state(false)
  let labelsOpen = $state(false)
  let importOpen = $state(false)
  let settingsOpen = $state(false)
  const Active = $derived(VIEW_COMPONENTS[current])

  // Overdue rollover: on open — and again when the tab comes back into view on a
  // later day (a Tailscale tab often stays open across midnight) — every
  // uncompleted task with a past due date moves onto today. The browser supplies
  // "today" (Hard Rule 7); at most one call per local day, retried on the next
  // visibility change if the backend was unreachable.
  let rolledOverOn = ''
  async function rolloverOverdue() {
    const today = toISODate(new Date())
    if (today === rolledOverOn) return
    try {
      const { moved } = await api.tasks.rollover(today)
      rolledOverOn = today
      if (moved > 0) bumpRefresh()
    } catch {
      // Transient (offline, backend restarting) — the views surface their own
      // load errors; the next visibility change retries the rollover.
    }
  }

  onMount(() => void rolloverOverdue())

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void rolloverOverdue()
  }
</script>

<svelte:document onvisibilitychange={onVisibilityChange} />

<div class="flex h-svh flex-col overflow-hidden">
  <header
    class="z-20 flex h-14 shrink-0 items-center gap-4 border-b border-lichen/80 bg-surface/75 px-4 shadow-soft backdrop-blur-md"
  >
    <div class="flex items-center gap-2">
      <Cairn class="h-7 w-7" />
      <span
        class="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-pine-deep"
        >Stinō</span
      >
    </div>

    <nav class="ml-2 hidden items-center gap-1 md:flex">
      {#each VIEWS as view (view.id)}
        <button
          type="button"
          onclick={() => (current = view.id)}
          class="rounded-full px-3.5 py-1.5 text-sm font-medium transition {current === view.id
            ? 'bg-pine/12 text-pine-deep ring-1 ring-pine/15'
            : 'text-sage hover:bg-pine/5 hover:text-pine-deep'}"
        >
          {view.label}
        </button>
      {/each}
    </nav>

    <div class="ml-auto flex items-center gap-1">
      <button
        type="button"
        onclick={() => (searchOpen = true)}
        aria-haspopup="dialog"
        aria-label="Search"
        class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-3.5-3.5" />
        </svg>
      </button>

      <button
        type="button"
        onclick={() => (labelsOpen = true)}
        aria-haspopup="dialog"
        aria-label="Labels"
        class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"
          />
          <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <button
        type="button"
        onclick={() => (settingsOpen = true)}
        aria-haspopup="dialog"
        aria-label="Settings"
        class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
    </div>
  </header>

  <main class="min-h-0 flex-1">
    {#key current}
      <div class="h-full animate-rise-in">
        <Active />
      </div>
    {/key}
  </main>

  <nav
    class="z-20 flex shrink-0 border-t border-lichen/80 bg-surface/85 backdrop-blur-md md:hidden"
  >
    {#each VIEWS as view (view.id)}
      <button
        type="button"
        onclick={() => (current = view.id)}
        class="relative flex-1 py-2.5 text-center text-xs font-medium transition {current ===
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

  <!-- Search / Labels / Import can mutate tasks or labels behind the standing view, so
       closing them bumps the refresh signal and the active view reloads. Settings only
       touches the theme, so it doesn't. -->
  <SearchDialog
    open={searchOpen}
    onClose={() => {
      searchOpen = false
      bumpRefresh()
    }}
  />
  <LabelManager
    open={labelsOpen}
    onClose={() => {
      labelsOpen = false
      bumpRefresh()
    }}
  />
  <SettingsDialog
    open={settingsOpen}
    onClose={() => (settingsOpen = false)}
    onImport={() => {
      settingsOpen = false
      importOpen = true
    }}
  />
  <ImportDialog
    open={importOpen}
    onClose={() => {
      importOpen = false
      bumpRefresh()
    }}
  />
</div>
