<script lang="ts">
  import { dndzone } from 'svelte-dnd-action'
  import { getCalendarContext } from '../../lib/controllers/calendar-context'
  import { formatDayFull, toISODate } from '../../lib/date'
  import { dayCellToneClass } from '../../lib/dnd/cell-tone'
  import { createLineFit } from '../../lib/dnd/line-fit.action.svelte'
  import { activateOnKey } from '../../lib/dnd/tap'
  import { calendarZone } from '../../lib/dnd/zone-options'
  import { dayCellLabel } from '../../lib/format'
  import { labelTint } from '../../lib/labels'
  import { moreTasks } from '../../lib/messages'
  import type { CellItem } from '../../lib/tasks/projection'
  import { todayKey } from '../../lib/today.svelte'
  import DateBadge from '../../lib/components/DateBadge.svelte'

  let { date, inCurrentMonth }: { date: Date; inCurrentMonth: boolean } = $props()

  const { core, board, selection } = getCalendarContext()
  const dateKey = $derived(toISODate(date))
  const items = $derived(board.board[dateKey] ?? [])
  const isToday = $derived(dateKey === todayKey())
  const open = $derived(selection.selectedKey === dateKey)
  const fit = createLineFit(() => items.length)
  const ariaLabel = $derived(dayCellLabel(formatDayFull(date), items.length, fit.overflow))
  const toggle = () => (open ? selection.clear() : selection.select(date))
</script>

{#snippet line(item: CellItem, index: number)}
  {@const tint = labelTint(core.labelFor(item.task)?.color, 'bg-pine/10')}
  <li
    class="shrink-0 truncate rounded px-1 py-px text-3xs leading-tight {tint.class}
      {item.task.completed ? 'text-sage line-through' : 'text-ink'}
      {fit.hides(index, item) ? 'invisible' : ''}"
    style={tint.style}
  >
    {item.task.title}
  </li>
{/snippet}

<!-- A div, not a <button>: the cell holds a list, which a button may not contain. -->
<div
  role="button"
  tabindex="0"
  onclick={toggle}
  onkeydown={activateOnKey(toggle)}
  aria-label={ariaLabel}
  class="flex h-full min-h-0 w-full select-none flex-col gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition
    {dayCellToneClass(isToday, inCurrentMonth, open)}
    {board.dropKey === dateKey ? 'border-pine bg-pine/10 ring-2 ring-inset ring-pine/60' : ''}"
>
  <!-- "+N" shares the date row so it never takes a task line's height. -->
  <div class="flex w-full shrink-0 items-center justify-between gap-0.5">
    <DateBadge {date} {isToday} muted={!inCurrentMonth} size="sm" />
    {#if fit.overflow > 0}
      <span
        class="shrink-0 pr-0.5 text-3xs leading-tight tabular-nums {isToday
          ? 'text-pine'
          : 'text-sage'}"
        title={moreTasks(fit.overflow)}
      >
        +{fit.overflow}
      </span>
    {/if}
  </div>

  {#if open}
    <ul {@attach fit.measure} class="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-hidden">
      {#each items as item, i (item.id)}
        {@render line(item, i)}
      {/each}
    </ul>
  {:else}
    <!-- Morphing to the 10px cell line would shrink the clone to a sliver under the finger. -->
    <ul
      {@attach fit.measure}
      class="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-hidden"
      use:dndzone={calendarZone(items, {
        dragDisabled: true,
        morphDisabled: true,
        zoneItemTabIndex: -1,
        zoneTabIndex: -1,
      })}
      onconsider={(e) => board.consider(dateKey, e)}
      onfinalize={(e) => board.finalize(dateKey, e)}
    >
      {#each items as item, i (item.id)}
        {@render line(item, i)}
      {/each}
    </ul>
  {/if}
</div>
