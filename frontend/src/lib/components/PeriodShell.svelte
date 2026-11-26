<script lang="ts">
  import type { Snippet } from 'svelte'
  import { GHOST_BTN_CLASS } from '../constants'
  import { getCalendarContext } from '../controllers/calendar-context'
  import type { PeriodNav } from '../controllers/period-nav.svelte'
  import { swipe } from '../dnd/swipe.action'
  import { LOADING, periodStepLabel, TODAY } from '../messages'
  import ErrorAlert from './ErrorAlert.svelte'
  import IconButton from './IconButton.svelte'
  import PageHeader from './PageHeader.svelte'
  import Chevron from './icons/Chevron.svelte'

  let {
    nav,
    title,
    unit,
    nowrap = false,
    children,
  }: {
    nav: PeriodNav
    title: string
    unit: 'month' | 'week'
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
  <PageHeader {title} {nowrap} class="mb-3 gap-2 px-0.5">
    {#snippet status()}
      {#if core.loading}
        <span class="text-xs text-sage">{LOADING}</span>
      {/if}
    {/snippet}
    {#snippet actions()}
      <div class="flex items-center gap-1.5 {nowrap ? 'shrink-0' : ''}">
        <IconButton label={periodStepLabel(unit, -1)} onclick={() => nav.go(-1)}>
          <Chevron dir="left" />
        </IconButton>
        <button
          type="button"
          onclick={nav.goToday}
          class="{GHOST_BTN_CLASS} px-3 py-1.5 {noWrap} text-sm"
        >
          {TODAY}
        </button>
        <IconButton label={periodStepLabel(unit, 1)} onclick={() => nav.go(1)}>
          <Chevron dir="right" />
        </IconButton>
      </div>
    {/snippet}
  </PageHeader>

  <ErrorAlert error={core.error} class="mb-3" />

  {@render children()}
</section>
