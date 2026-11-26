<script lang="ts">
  import { DAYS_PER_WEEK } from '../../lib/constants'
  import { getCalendarContext } from '../../lib/controllers/calendar-context'
  import { isSameMonth, monthWeekCount } from '../../lib/date'
  import DayListSection from '../../lib/components/DayListSection.svelte'
  import CalendarCellMobile from './CalendarCellMobile.svelte'
  import { createGridExpand } from './grid-expand.svelte'

  let {
    cells,
    year,
    month,
  }: { cells: { date: Date; key: string }[]; year: number; month: number } = $props()

  const { board, selection } = getCalendarContext()
  const weeks = $derived(monthWeekCount(year, month))
  const shown = $derived(cells.slice(0, weeks * DAYS_PER_WEEK))
  const expand = createGridExpand(() => board.dragging)
</script>

<div {@attach expand.watch} class="vt-calendar flex min-h-0 flex-1 flex-col">
  <div
    class="grid min-h-0 flex-[11] grid-cols-7 gap-1"
    style:grid-template-rows="repeat({weeks}, minmax(0, 1fr))"
  >
    {#each shown as { date, key } (key)}
      <CalendarCellMobile {date} inCurrentMonth={isSameMonth(date, month)} />
    {/each}
  </div>

  {#if selection.selectedDate}
    <div
      class="mt-2 min-h-0 flex-[9] overflow-y-auto border-t border-lichen pt-2
        {expand.expanded ? 'hidden' : ''}"
    >
      <DayListSection date={selection.selectedDate} variant="month" headingLevel={2} />
    </div>
  {/if}
</div>
