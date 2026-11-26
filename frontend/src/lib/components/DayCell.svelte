<script lang="ts">
  import { dragHandleZone } from 'svelte-dnd-action'
  import { DND_GRID_TOUCH_HOLD_MS } from '../constants'
  import { getCalendarContext } from '../controllers/calendar-context'
  import { formatDayFull, toISODate, weekdayAbbrev } from '../date'
  import { clickOnEmptySpace } from '../dnd/cell-click.action'
  import { dayCellToneClass } from '../dnd/cell-tone'
  import { createLineFit } from '../dnd/line-fit.action.svelte'
  import { calendarZone } from '../dnd/zone-options'
  import { dayCellLabel } from '../format'
  import { addTaskOnLabel, moreTasks } from '../messages'
  import { todayKey } from '../today.svelte'
  import DateBadge from './DateBadge.svelte'
  import QuickAddButton from './QuickAddButton.svelte'
  import TaskPill from './TaskPill.svelte'

  let {
    date,
    variant,
    inCurrentMonth = true,
  }: { date: Date; variant: 'month' | 'week'; inCurrentMonth?: boolean } = $props()

  const { core, board, selection, composer } = getCalendarContext()
  const dateKey = $derived(toISODate(date))
  const items = $derived(board.board[dateKey] ?? [])
  const isToday = $derived(dateKey === todayKey())
  const open = $derived(selection.selectedKey === dateKey)
  const dayLabel = $derived(formatDayFull(date))
  const ariaLabel = $derived(dayCellLabel(dayLabel, items.length))
  const fit = createLineFit(() => items.length)
  const select = () => selection.select(date)
</script>

{#snippet pills(canDrag: boolean)}
  {#each items as item, i (item.id)}
    <li aria-label={item.task.title} class="shrink-0 {fit.hides(i, item) ? 'invisible' : ''}">
      <TaskPill task={item.task} draggable={canDrag} />
    </li>
  {/each}
{/snippet}

<div
  {@attach open && selection.anchorTo}
  {@attach clickOnEmptySpace(select, () => board.dragging)}
  class="group flex h-full w-full flex-col overflow-hidden rounded-lg border transition
    {variant === 'month' ? 'min-h-0 gap-1 p-1 sm:p-1.5' : 'min-h-[4rem] gap-1.5 p-2'}
    {dayCellToneClass(isToday, inCurrentMonth, open)}"
>
  <div class="flex shrink-0 items-center justify-between {variant === 'week' ? 'gap-1' : ''}">
    {#if variant === 'month'}
      <DateBadge
        {date}
        {isToday}
        muted={!inCurrentMonth}
        label={ariaLabel}
        onclick={select}
        {@attach open && selection.markDayButton}
      />
    {:else}
      <button
        {@attach open && selection.markDayButton}
        type="button"
        onclick={select}
        aria-label={ariaLabel}
        class="-mx-1 flex shrink-0 items-baseline gap-1.5 rounded-md px-1 text-left transition hover:bg-pine/5 active:bg-pine/10"
      >
        <span
          class="text-2xs font-medium uppercase tracking-wide {isToday ? 'text-pine' : 'text-sage'}"
        >
          {weekdayAbbrev(date)}
        </span>
        <DateBadge {date} {isToday} />
      </button>
    {/if}

    <QuickAddButton
      onAdd={() => composer.create({ date: dateKey })}
      label={addTaskOnLabel(dayLabel)}
      alwaysOnMobile={variant === 'week'}
    />
  </div>

  {#if open}
    <ul {@attach fit.measure} class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
      {@render pills(false)}
    </ul>
  {:else}
    <!-- Not a tab stop at rest; the library re-enables zones as targets during a keyboard drag. -->
    <ul
      {@attach fit.measure}
      aria-label={dayLabel}
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
      use:dragHandleZone={calendarZone(items, {
        delayTouchStart: DND_GRID_TOUCH_HOLD_MS,
        dragDisabled: core.pending,
        zoneTabIndex: -1,
      })}
      onconsider={(e) => board.consider(dateKey, e)}
      onfinalize={(e) => board.finalize(dateKey, e)}
    >
      {@render pills(true)}
    </ul>
  {/if}

  {#if fit.overflow > 0}
    <button
      type="button"
      onclick={select}
      class="shrink-0 pl-0.5 text-left text-2xs leading-tight transition hover:text-pine-deep {isToday
        ? 'text-pine'
        : 'text-sage'}"
    >
      +{moreTasks(fit.overflow)}
    </button>
  {/if}
</div>
