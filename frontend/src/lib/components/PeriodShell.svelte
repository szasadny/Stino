<script lang="ts">
  import type { Snippet } from 'svelte'
  import { DISPLAY_TITLE_CLASS, GHOST_BTN_CLASS } from '../constants'
  import { getCalendarContext } from '../controllers/calendar-context'
  import type { PeriodNav } from '../controllers/period-nav.svelte'
  import { swipe } from '../dnd/swipe.action'
  import { LOADING } from '../messages'
  import ErrorAlert from './ErrorAlert.svelte'
  import IconButton from './IconButton.svelte'
  import Chevron from './icons/Chevron.svelte'

  let {
    nav,
    title,
    unit,
    todayLabel,
    nowrap = false,
    children,
  }: {
    nav: PeriodNav
    title: string
    unit: 'month' | 'week'
    todayLabel: string
    nowrap?: boolean
    children: Snippet
  } = $props()

  const { core } = getCalendarContext()
  const noWrap = $derived(nowrap ? 'whitespace-nowrap' : '')
</script>

<!-- Swipe on the section, not the vt-calendar pane: a captured pane drops hit-testing mid-slide. -->
<section
  class="flex h-full flex-col px-3 py-3 sm:px-5 sm:py-4"
  use:swipe={{ onLeft: () => nav.go(1), onRight: () => nav.go(-1) }}
>
  <header class="mb-3 flex shrink-0 items-center justify-between gap-2 px-0.5">
    <div class="flex items-baseline gap-2">
      <h1 class="{DISPLAY_TITLE_CLASS} text-xl {noWrap} sm:text-2xl">
        {title}
      </h1>
      {#if core.loading}
        <span class="text-xs text-sage">{LOADING}</span>
      {/if}
    </div>
    <div class="flex items-center gap-1 {nowrap ? 'shrink-0' : ''}">
      <IconButton label="Previous {unit}" onclick={() => nav.go(-1)}>
        <Chevron dir="left" />
      </IconButton>
      <button
        type="button"
        onclick={nav.goToday}
        class="{GHOST_BTN_CLASS} px-3 py-1.5 {noWrap} text-sm"
      >
        {todayLabel}
      </button>
      <IconButton label="Next {unit}" onclick={() => nav.go(1)}>
        <Chevron dir="right" />
      </IconButton>
    </div>
  </header>

  <ErrorAlert error={core.error} class="mb-3" />

  {@render children()}
</section>
