<script lang="ts">
  import type { Component } from 'svelte'
  import Cairn from './lib/components/Cairn.svelte'
  import IconButton from './lib/components/IconButton.svelte'
  import Gear from './Gear.svelte'
  import Search from './lib/components/icons/Search.svelte'
  import Tag from './Tag.svelte'
  import { watchDayChange } from './lib/day-change.svelte'
  import { bumpRefresh } from './lib/refresh.svelte'
  import type { ViewId } from './lib/types'
  import { LABELS, SEARCH, SETTINGS } from './lib/messages'
  import { isCompact } from './lib/viewport.svelte'
  import NavTabs from './NavTabs.svelte'
  import ImportDialog from './overlays/import/ImportDialog.svelte'
  import LabelManager from './overlays/labels/LabelManager.svelte'
  import SearchDialog from './overlays/search/SearchDialog.svelte'
  import SettingsDialog from './overlays/settings/SettingsDialog.svelte'
  import InboxView from './views/inbox/InboxView.svelte'
  import MonthView from './views/month/MonthView.svelte'
  import TodayView from './views/today/TodayView.svelte'
  import WeekView from './views/week/WeekView.svelte'

  const VIEW_COMPONENTS = {
    inbox: InboxView,
    today: TodayView,
    week: WeekView,
    month: MonthView,
  } satisfies Record<ViewId, Component>

  let current = $state<ViewId>('month')
  let searchOpen = $state(false)
  let labelsOpen = $state(false)
  let importOpen = $state(false)
  let settingsOpen = $state(false)
  const Active = $derived(VIEW_COMPONENTS[current])

  watchDayChange()

  function select(view: ViewId) {
    current = view
  }
</script>

<div class="flex h-dvh flex-col overflow-hidden">
  <header
    class="z-chrome flex h-14 shrink-0 items-center gap-4 border-b border-lichen/80 bg-surface/75 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] shadow-soft backdrop-blur-md"
  >
    <div class="flex items-center gap-2">
      <Cairn class="h-7 w-7" />
      <span
        class="font-display text-wordmark font-semibold leading-none tracking-tight text-pine-deep"
        >Stinō</span
      >
    </div>

    {#if !isCompact()}
      <NavTabs {current} onSelect={select} placement="header" />
    {/if}

    <div class="ml-auto flex items-center gap-1">
      <IconButton label={SEARCH} onclick={() => (searchOpen = true)} aria-haspopup="dialog">
        <Search strokeWidth={1.8} />
      </IconButton>
      <IconButton label={LABELS} onclick={() => (labelsOpen = true)} aria-haspopup="dialog">
        <Tag />
      </IconButton>
      <IconButton label={SETTINGS} onclick={() => (settingsOpen = true)} aria-haspopup="dialog">
        <Gear />
      </IconButton>
    </div>
  </header>

  <main class="min-h-0 flex-1">
    {#key current}
      <div class="h-full animate-rise-in">
        <Active />
      </div>
    {/key}
  </main>

  {#if isCompact()}
    <NavTabs {current} onSelect={select} placement="bottom" />
  {/if}

  <!-- Search and Labels mutate data behind the view, so closing them bumps refresh. -->
  {#if searchOpen}
    <SearchDialog
      onClose={() => {
        searchOpen = false
        bumpRefresh()
      }}
    />
  {/if}
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
  <ImportDialog open={importOpen} onClose={() => (importOpen = false)} />
</div>
