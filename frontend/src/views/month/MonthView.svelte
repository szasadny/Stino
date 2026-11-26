<script lang="ts">
  import { WEEKDAYS, buildMonthGrid, formatMonthYear, isSameMonth, toISODate } from '../../lib/date'
  import { EYEBROW_CLASS } from '../../lib/constants'
  import { LOAD_CALENDAR_FAILED } from '../../lib/messages'
  import { isCompact } from '../../lib/viewport.svelte'
  import { createCalendarBoard } from '../../lib/controllers/calendar-board.svelte'
  import { setCalendarContext } from '../../lib/controllers/calendar-context'
  import { createCalendarSelection } from '../../lib/controllers/calendar-selection.svelte'
  import { createComposer } from '../../lib/controllers/composer.svelte'
  import { createPeriodNav } from '../../lib/controllers/period-nav.svelte'
  import { createTaskCore } from '../../lib/controllers/task-core.svelte'
  import ComposerDialog from '../../lib/components/composer/ComposerDialog.svelte'
  import DayCell from '../../lib/components/DayCell.svelte'
  import DayPanel from '../../lib/components/DayPanel.svelte'
  import PeriodShell from '../../lib/components/PeriodShell.svelte'
  import MonthGridCompact from './MonthGridCompact.svelte'
  import { monthRange, monthStart, stepMonth, withDay } from './month-period'

  const core = createTaskCore()
  const selection = createCalendarSelection(core)
  const nav = createPeriodNav(core, {
    periodStart: monthStart,
    step: stepMonth,
    rangeFor: (start) => monthRange(start, selection.selectedKey),
    failMsg: LOAD_CALENDAR_FAILED,
  })
  const year = $derived(nav.start.getFullYear())
  const month = $derived(nav.start.getMonth())
  const cells = $derived(
    buildMonthGrid(year, month).map((date) => ({ date, key: toISODate(date) })),
  )
  const boardKeys = $derived(
    withDay(
      cells.map((c) => c.key),
      selection.selectedKey,
    ),
  )

  const composer = createComposer(core)
  const board = createCalendarBoard(core, () => boardKeys, composer.edit)
  setCalendarContext({ core, board, selection, composer })
</script>

<PeriodShell {nav} title={formatMonthYear(year, month)} unit="month">
  <div class="grid shrink-0 grid-cols-7 gap-1.5 px-0.5 pb-1">
    {#each WEEKDAYS as weekday (weekday)}
      <div class="text-center text-2xs {EYEBROW_CLASS}">
        {weekday}
      </div>
    {/each}
  </div>

  {#if isCompact()}
    <MonthGridCompact {cells} {year} {month} />
  {:else}
    <div class="vt-calendar grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5">
      {#each cells as { date, key } (key)}
        <DayCell {date} variant="month" inCurrentMonth={isSameMonth(date, month)} />
      {/each}
    </div>
  {/if}
</PeriodShell>

{#if !isCompact() && selection.selectedDate}
  <DayPanel date={selection.selectedDate} />
{/if}

<ComposerDialog {composer} />
