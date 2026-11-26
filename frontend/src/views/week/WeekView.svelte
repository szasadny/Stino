<script lang="ts">
  import { untrack } from 'svelte'
  import {
    addWeeks,
    buildWeekGrid,
    formatWeekRange,
    formatWeekRangeCompact,
    spanBounds,
    startOfWeek,
    toISODate,
  } from '../../lib/date'
  import { dragEdgeScroll } from '../../lib/dnd/drag-scroll.action'
  import { LOAD_WEEK_FAILED } from '../../lib/messages'
  import { todayDate, todayKey } from '../../lib/today.svelte'
  import { isCompact } from '../../lib/viewport.svelte'
  import { createCalendarBoard } from '../../lib/controllers/calendar-board.svelte'
  import { setCalendarContext } from '../../lib/controllers/calendar-context'
  import { createCalendarSelection } from '../../lib/controllers/calendar-selection.svelte'
  import { createComposer } from '../../lib/controllers/composer.svelte'
  import { createPeriodNav } from '../../lib/controllers/period-nav.svelte'
  import { createTaskCore } from '../../lib/controllers/task-core.svelte'
  import ComposerDialog from '../../lib/components/composer/ComposerDialog.svelte'
  import DayCell from '../../lib/components/DayCell.svelte'
  import DayListSection from '../../lib/components/DayListSection.svelte'
  import DayPanel from '../../lib/components/DayPanel.svelte'
  import PeriodShell from '../../lib/components/PeriodShell.svelte'
  import DaySheet from './DaySheet.svelte'
  import { scrollToDay } from './scroll-to-day.action'

  const core = createTaskCore()
  const selection = createCalendarSelection(core)
  let todayScroll = $state(0)
  const scrollToToday = () => todayScroll++
  const nav = createPeriodNav(core, {
    periodStart: startOfWeek,
    step: addWeeks,
    rangeFor: (start) => spanBounds(buildWeekGrid(start)),
    failMsg: LOAD_WEEK_FAILED,
    onNavigate: selection.clear,
    onToday: scrollToToday,
  })
  let opened = false
  $effect(() => {
    if (core.loading || opened) return
    opened = true
    untrack(scrollToToday)
  })
  const week = $derived(buildWeekGrid(nav.start))
  const days = $derived(week.map((date) => ({ date, key: toISODate(date) })))
  const weekKeys = $derived(days.map((d) => d.key))
  const title = $derived(
    isCompact() ? formatWeekRangeCompact(week, todayDate().getFullYear()) : formatWeekRange(week),
  )

  const composer = createComposer(core)
  const board = createCalendarBoard(core, () => weekKeys, composer.edit)
  setCalendarContext({ core, board, selection, composer })
</script>

<PeriodShell {nav} {title} unit="week" nowrap>
  {#if isCompact()}
    <div
      class="vt-calendar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto"
      use:dragEdgeScroll
      use:scrollToDay={{ key: todayKey(), request: todayScroll }}
    >
      {#each days as { date, key } (key)}
        <div data-day={key}>
          <DayListSection {date} variant="week" />
        </div>
      {/each}
    </div>
  {:else}
    <div class="vt-calendar grid min-h-0 flex-1 grid-cols-7 gap-2">
      {#each days as { date, key } (key)}
        <DayCell {date} variant="week" />
      {/each}
    </div>
  {/if}
</PeriodShell>

{#if isCompact()}
  {#key selection.selectedDate}
    <DaySheet />
  {/key}
{:else if selection.selectedDate}
  <DayPanel date={selection.selectedDate} />
{/if}

<ComposerDialog {composer} />
