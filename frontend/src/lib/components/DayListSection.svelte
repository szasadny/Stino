<script lang="ts">
  import { dndzone } from 'svelte-dnd-action'
  import { DND_TOUCH_HOLD_MS, DROP_TARGET_RING_CLASSES } from '../constants'
  import { getCalendarContext } from '../controllers/calendar-context'
  import { formatDayFull, toISODate, weekdayLong } from '../date'
  import { calendarZone } from '../dnd/zone-options'
  import { addTaskOnLabel, NOTHING_SCHEDULED } from '../messages'
  import { todayKey } from '../today.svelte'
  import DateBadge from './DateBadge.svelte'
  import IconButton from './IconButton.svelte'
  import QuickAddButton from './QuickAddButton.svelte'
  import TaskRow from './TaskRow.svelte'
  import Chevron from './icons/Chevron.svelte'
  import Close from './icons/Close.svelte'

  let { date, variant }: { date: Date; variant: 'month' | 'week' } = $props()

  const { core, board, selection, composer } = getCalendarContext()
  const dateKey = $derived(toISODate(date))
  const items = $derived(board.board[dateKey] ?? [])
  const isToday = $derived(dateKey === todayKey())
  const dayLabel = $derived(formatDayFull(date))
</script>

{#snippet heading()}
  <span class="text-sm font-semibold {isToday ? 'text-pine' : 'text-ink'}">
    {weekdayLong(date)}
  </span>
  <DateBadge {date} {isToday} />
{/snippet}

<section class="group">
  <div class="mb-2 flex items-center justify-between gap-2 px-0.5">
    {#if variant === 'week'}
      <button
        type="button"
        onclick={() => selection.select(date)}
        aria-label="Open {dayLabel}"
        class="-ml-1 flex items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-pine/5 active:bg-pine/10"
      >
        {@render heading()}
        <Chevron dir="right" class="h-3.5 w-3.5 text-sage/70" />
      </button>
    {:else}
      <div class="flex items-center gap-2">
        {@render heading()}
      </div>
    {/if}

    <div class="flex shrink-0 items-center gap-1">
      <QuickAddButton
        onAdd={() => composer.create({ date: dateKey })}
        label={addTaskOnLabel(dayLabel)}
        alwaysOnMobile
      />
      {#if variant === 'month'}
        <IconButton label="Hide {dayLabel}" onclick={selection.clear}>
          <Close />
        </IconButton>
      {/if}
    </div>
  </div>

  <!-- Outside the zone: its children must match dnd items. -->
  <div class="relative">
    <ul
      class="min-h-[2.75rem] space-y-2"
      use:dndzone={calendarZone(items, {
        delayTouchStart: DND_TOUCH_HOLD_MS,
        dragDisabled: core.pending,
        dropTargetClasses: ['rounded-lg', ...DROP_TARGET_RING_CLASSES],
        zoneItemTabIndex: -1,
      })}
      onconsider={(e) => board.consider(dateKey, e)}
      onfinalize={(e) => board.finalize(dateKey, e)}
    >
      {#each items as item (item.id)}
        <li>
          <TaskRow
            task={item.task}
            label={core.labelFor(item.task)}
            slim
            onToggle={() => core.toggle(item.task)}
            onEdit={() => composer.edit(item.task)}
            holdToDrag
          />
        </li>
      {/each}
    </ul>
    {#if items.length === 0}
      <p class="pointer-events-none absolute inset-0 flex items-center px-0.5 text-sm text-sage/70">
        {NOTHING_SCHEDULED}
      </p>
    {/if}
  </div>
</section>
