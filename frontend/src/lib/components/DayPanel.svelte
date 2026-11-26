<script lang="ts">
  import type { Attachment } from 'svelte/attachments'
  import { on } from 'svelte/events'
  import { dragHandleZone } from 'svelte-dnd-action'
  import { DND_GRID_TOUCH_HOLD_MS, MUTED_CENTER_CLASS } from '../constants'
  import { getCalendarContext } from '../controllers/calendar-context'
  import { formatDayFull, toISODate } from '../date'
  import { panelPosition } from '../dnd/panel-pos'
  import { calendarZone } from '../dnd/zone-options'
  import { dayTaskCount } from '../format'
  import { DROP_OR_ADD_HINT, tasksOnDayLabel } from '../messages'
  import AddTaskButton from './AddTaskButton.svelte'
  import PanelHeader from './PanelHeader.svelte'
  import TaskPill from './TaskPill.svelte'

  let { date }: { date: Date } = $props()

  const { core, board, selection, composer } = getCalendarContext()
  const dateKey = $derived(toISODate(date))
  const items = $derived(board.board[dateKey] ?? [])
  const title = $derived(formatDayFull(date))
  const subtitle = $derived(dayTaskCount(items.length))

  let panelSize = $state.raw({ width: 0, height: 0 })
  let viewportW = $state(0)
  let viewportH = $state(0)
  const pos = $derived(
    selection.anchorRect && panelSize.width > 0 && panelSize.height > 0
      ? panelPosition(selection.anchorRect, panelSize, { width: viewportW, height: viewportH })
      : null,
  )

  // A resize of the panel also re-reads the anchor, which may have moved since it was measured.
  const measurePanel: Attachment<HTMLElement> = (panel) => {
    const observer = new ResizeObserver(() => {
      panelSize = { width: panel.clientWidth, height: panel.clientHeight }
      selection.remeasure()
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }

  // Un-hiding after a drag would replay the entrance, so it runs once per open.
  let opening = $state(true)
  function settle(e: AnimationEvent) {
    if (e.target === e.currentTarget) opening = false
  }

  // Do not steal Escape while a dialog is open above the panel.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) selection.clear()
  }
</script>

<svelte:window
  bind:innerWidth={viewportW}
  bind:innerHeight={viewportH}
  onresize={selection.remeasure}
  onscrollcapture={selection.remeasure}
  onkeydown={onKeydown}
/>

<div
  {@attach measurePanel}
  onanimationend={settle}
  {@attach (panel) => on(panel, 'animationcancel', settle)}
  class="fixed z-floating max-h-[75dvh] w-[19rem] flex-col overflow-hidden rounded-2xl border border-lichen bg-surface shadow-overlay
    {opening ? 'animate-rise-in' : ''}
    {board.dragging ? 'hidden' : 'flex'}
    {pos ? '' : 'pointer-events-none opacity-0'}"
  style:left="{pos?.left ?? 0}px"
  style:top="{pos?.top ?? 0}px"
  role="dialog"
  aria-label={tasksOnDayLabel(title)}
>
  <PanelHeader {title} {subtitle} onClose={selection.clear} size="sm" />

  <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
    <!-- Min height keeps an empty day droppable. -->
    <ul
      class="flex flex-col gap-1 {items.length === 0 ? 'min-h-[3rem]' : ''}"
      use:dragHandleZone={calendarZone(items, {
        delayTouchStart: DND_GRID_TOUCH_HOLD_MS,
        dragDisabled: core.pending,
      })}
      onconsider={(e) => board.consider(dateKey, e)}
      onfinalize={(e) => board.finalize(dateKey, e)}
    >
      {#each items as item (item.id)}
        <li>
          <TaskPill task={item.task} draggable />
        </li>
      {/each}
    </ul>

    {#if items.length === 0}
      <p class="{MUTED_CENTER_CLASS} pt-2">{DROP_OR_ADD_HINT}</p>
    {/if}
  </div>

  <div class="shrink-0 border-t border-lichen px-3 py-2.5">
    <AddTaskButton onclick={() => composer.create({ date: dateKey })} class="py-2" />
  </div>
</div>
