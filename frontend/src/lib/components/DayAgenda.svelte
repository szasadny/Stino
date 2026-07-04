<script lang="ts">
  // A day's task list — the readable single-day view (Today and the month/week day
  // sheet). By DEFAULT it's a FLAT, drag-sorted list (timed-first, then the one manual
  // `sort_order`), so it reads the same top-to-bottom order as the month/week cells the
  // zoom opened from. A small toggle switches to the alternative GROUPED view, which
  // partitions the day into label sections (the chip is each section's header; a trailing
  // "No label" group holds the rest). The flat/grouped choice is a shared, persisted
  // preference (lib/group-view) so Today and the day sheet stay in sync. Flat is modelled
  // as a single unlabeled section (`dayViewGroups`), so ONE rendering path covers both.
  //
  // Drag lives here in exactly ONE place, kept deliberately flat (the only pattern that
  // proved reliable — the Inbox uses it too): untimed tasks reorder within their group,
  // each group its own dndzone. Timed tasks are pinned by time, so they render first
  // without a handle. Cross-group drag is disabled (a distinct dnd `type` per group) —
  // that would mean relabeling, a different gesture. On a drop we emit the FULL day's
  // untimed ids in grouped reading order via `onReorder`, so every view (which sorts
  // untimed by sort_order) shows the same sequence this view reads top-to-bottom.
  //
  // The drag GESTURE differs by input: a wide screen grabs the 6-dot grip handle
  // (`dragHandleZone` + `dragHandle`); a phone drags the whole row after a short press-
  // and-hold (`dndzone` + `delayTouchStart`), the natural touch reorder — so a tap still
  // opens/toggles and a scroll still scrolls, no fishing for the tiny grip. `isCompact()`
  // picks exactly ONE of the two zones per group, so the "never mount duplicate zones"
  // rule holds (the whole app renders one layout at a time anyway).
  //
  // Label-section ORDER is changed with up/down controls on the section header (via
  // `onReorderLabels`), NOT by dragging the whole section: a section contains its task
  // dndzone, so making the section draggable would nest one zone inside another, which
  // breaks the inner task drag. The order is global, so it changes label order
  // everywhere. The "No label" group is never reorderable and always renders last.
  import { untrack } from 'svelte'
  import { dndzone, dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import { DND_FLIP_MS, DND_TOUCH_HOLD_MS } from '../constants'
  import { isCompact } from '../viewport.svelte'
  import { openWithoutPhantomClick } from '../phantom-click'
  import { labelLookup } from '../labels'
  import { dayViewGroups, type TaskGroup } from '../grouping'
  import { groupByLabelView, toggleGroupByLabelView } from '../group-view.svelte'
  import { untimedReadingOrder } from '../ordering'
  import LabelChip from './LabelChip.svelte'
  import TaskRow from './TaskRow.svelte'

  let {
    tasks,
    labels,
    pending = false,
    onToggle,
    onEdit,
    onReorder,
    onReorderLabels,
  }: {
    tasks: Task[]
    labels: Label[]
    // While a mutation is in flight, lock drag-start so a reorder can't race it.
    pending?: boolean
    onToggle: (task: Task) => void
    onEdit?: (task: Task) => void
    onReorder?: (ids: number[]) => void
    onReorderLabels?: (ids: number[]) => void
  } = $props()

  // Flat (default) vs. grouped-by-label — a shared, persisted preference.
  const grouped = $derived(groupByLabelView())
  // The grouped view is only worth offering when a task actually carries a known label —
  // otherwise grouping just reproduces the flat list, so the toggle would be noise.
  const canGroup = $derived.by(() => {
    const known = new Set(labels.map((l) => l.id))
    return tasks.some((t) => t.label_id != null && known.has(t.label_id))
  })
  // What we actually render. The toggle is hidden when `canGroup` is false, so honour the
  // persisted `grouped` preference ONLY when this day can group — otherwise a preference
  // turned on elsewhere would strand a day of unlabeled tasks under a lone "No label"
  // header with no visible toggle to switch back. Flat renders as one unlabeled section
  // holding every task in canonical-sort order, so one section-based path serves both.
  const effectiveGrouped = $derived(grouped && canGroup)
  const groups = $derived(dayViewGroups(tasks, labels, effectiveGrouped))
  const reorderable = $derived(onReorder != null)
  // Phone ⇒ whole-row press-and-hold drag; wide ⇒ grip handle. See the header note.
  const compact = $derived(isCompact())

  // Phone rows render `slim` (one line, no meta) for a uniform day-list look across
  // Today / the day sheet / the week sections. The flat list carries the label as a
  // colour dot; the grouped view doesn't (its section header already names the label).
  const labelFor = $derived(labelLookup(labels))
  const rowLabel = (task: Task) => (compact && !effectiveGrouped ? labelFor(task) : undefined)

  const keyOf = (group: TaskGroup) => (group.label ? String(group.label.id) : 'none')
  const timedOf = (group: TaskGroup) => group.tasks.filter((t) => t.due_time != null)

  // The labeled sections in display order; the "No label" group is non-reorderable and
  // pinned last (rendered outside this list).
  type LabelSection = { id: number; group: TaskGroup }
  const labelSections = $derived(
    groups.filter((g) => g.label != null).map((g) => ({ id: g.label!.id, group: g })),
  )
  const noLabelGroup = $derived(groups.find((g) => g.label == null) ?? null)
  // Section up/down is only worthwhile with a handler AND more than one section.
  const reorderableLabels = $derived(onReorderLabels != null && labelSections.length > 1)

  // Move a labeled section one slot up/down and persist the new visible-label order; the
  // owning view folds it into the global label order. No-op at the ends.
  function moveSection(index: number, delta: -1 | 1) {
    const ids = labelSections.map((s) => s.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    onReorderLabels?.(ids)
  }

  // Mutable per-group untimed lists — the live source the task dndzones own. Rebuilt from
  // `groups` ONLY when no drag is in progress: `dragging` is read untracked so this effect
  // re-runs on a real data change (a reorder/toggle landing) but never mid-gesture, so it
  // can't clobber svelte-dnd-action's live `e.detail.items`.
  let dragging = $state(false)
  let untimed = $state<Record<string, Task[]>>({})
  $effect(() => {
    const next: Record<string, Task[]> = {}
    for (const group of groups) next[keyOf(group)] = group.tasks.filter((t) => t.due_time == null)
    if (untrack(() => dragging)) return
    untimed = next
  })

  function consider(key: string, e: CustomEvent<DndEvent<Task>>) {
    dragging = true
    untimed[key] = e.detail.items
  }

  function finalize(key: string, e: CustomEvent<DndEvent<Task>>) {
    untimed[key] = e.detail.items
    dragging = false // clear before notifying so a resulting data change can re-project
    // The whole day's untimed ids in grouped reading order (group order, then each
    // group's live order) — exactly what api.tasks.reorder expects.
    const liveGroups = groups.map((group) => ({
      label: group.label,
      tasks: untimed[keyOf(group)] ?? [],
    }))
    onReorder?.(untimedReadingOrder(liveGroups))
  }
</script>

{#snippet grip(title: string)}
  <div
    use:dragHandle
    {title}
    class="grid h-5 w-5 cursor-grab touch-none place-items-center rounded text-sage transition hover:text-pine-deep active:cursor-grabbing"
  >
    <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  </div>
{/snippet}

{#snippet sectionBody(group: TaskGroup, sectionIndex: number | null)}
  {@const key = keyOf(group)}
  {@const timed = timedOf(group)}
  <!-- Section header — only in the grouped view; the flat list has no per-label headers. -->
  {#if effectiveGrouped}
    <div class="mb-2 flex items-center gap-1.5 px-0.5">
      {#if group.label}
        <LabelChip name={group.label.name} color={group.label.color} emoji={group.label.emoji} />
      {:else}
        <span class="text-xs font-medium uppercase tracking-wide text-sage">No label</span>
      {/if}
      {#if sectionIndex != null && reorderableLabels}
        <div class="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onclick={() => moveSection(sectionIndex, -1)}
            disabled={sectionIndex === 0}
            aria-label="Move {group.label?.name ?? ''} up"
            class="grid h-6 w-6 place-items-center rounded text-sage transition hover:bg-pine/5 hover:text-pine-deep disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            onclick={() => moveSection(sectionIndex, 1)}
            disabled={sectionIndex === labelSections.length - 1}
            aria-label="Move {group.label?.name ?? ''} down"
            class="grid h-6 w-6 place-items-center rounded text-sage transition hover:bg-pine/5 hover:text-pine-deep disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if timed.length > 0}
    <ul class="space-y-2">
      {#each timed as task (`${task.id}:${task.occurrence_date ?? ''}`)}
        <li>
          <TaskRow
            {task}
            label={rowLabel(task)}
            slim={compact}
            onToggle={() => onToggle(task)}
            onEdit={onEdit ? () => onEdit(task) : undefined}
          />
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Untimed tasks: drag-to-reorder within this group. A distinct `type` keeps items
       from jumping to another group. Drag is enabled only when a reorder handler is
       provided and no mutation is in flight. A phone (compact) drags the whole row after
       a press-and-hold; a wide screen grabs the grip handle. Exactly one zone mounts. -->
  {#if compact}
    <ul
      class="space-y-2 {timed.length > 0 ? 'mt-2' : ''}"
      use:dndzone={{
        items: untimed[key] ?? [],
        type: `untimed-${key}`,
        flipDurationMs: DND_FLIP_MS,
        dropTargetStyle: {},
        dragDisabled: !reorderable || pending,
        delayTouchStart: DND_TOUCH_HOLD_MS,
        zoneItemTabIndex: -1,
      }}
      onconsider={(e) => consider(key, e)}
      onfinalize={(e) => finalize(key, e)}
    >
      {#each untimed[key] ?? [] as task (task.id)}
        <li>
          <TaskRow
            {task}
            label={rowLabel(task)}
            slim
            onToggle={() => onToggle(task)}
            onEdit={onEdit ? () => openWithoutPhantomClick(() => onEdit(task)) : undefined}
            holdToDrag={reorderable}
          />
        </li>
      {/each}
    </ul>
  {:else}
    <ul
      class="space-y-2 {timed.length > 0 ? 'mt-2' : ''}"
      use:dragHandleZone={{
        items: untimed[key] ?? [],
        type: `untimed-${key}`,
        flipDurationMs: DND_FLIP_MS,
        dropTargetStyle: {},
        dragDisabled: !reorderable || pending,
      }}
      onconsider={(e) => consider(key, e)}
      onfinalize={(e) => finalize(key, e)}
    >
      {#each untimed[key] ?? [] as task (task.id)}
        <li>
          <TaskRow
            {task}
            onToggle={() => onToggle(task)}
            onEdit={onEdit ? () => onEdit(task) : undefined}
          >
            {#snippet leading()}
              {#if reorderable}
                {@render grip('Drag to reorder')}
              {/if}
            {/snippet}
          </TaskRow>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#if groups.length === 0}
  <p class="py-6 text-center text-sm text-sage">No tasks on this day.</p>
{:else}
  {#if canGroup}
    <!-- Flat (default) vs. grouped-by-label. A calm segmented toggle; the choice is a
         shared, persisted preference so every day view stays in step. Only shown when a
         task carries a label (otherwise grouping would just reproduce the flat list). -->
    <div class="mb-3 flex justify-end">
      <div
        class="inline-flex rounded-lg border border-lichen bg-fog p-0.5 text-xs font-medium"
        role="group"
        aria-label="Sort tasks"
      >
        <button
          type="button"
          onclick={() => grouped && toggleGroupByLabelView()}
          aria-pressed={!grouped}
          class="rounded-md px-2.5 py-1 transition {!grouped
            ? 'bg-surface text-pine-deep shadow-soft'
            : 'text-sage hover:text-pine-deep'}"
        >
          List
        </button>
        <button
          type="button"
          onclick={() => !grouped && toggleGroupByLabelView()}
          aria-pressed={grouped}
          class="rounded-md px-2.5 py-1 transition {grouped
            ? 'bg-surface text-pine-deep shadow-soft'
            : 'text-sage hover:text-pine-deep'}"
        >
          By label
        </button>
      </div>
    </div>
  {/if}

  <div class="space-y-5">
    {#each labelSections as section, index (section.id)}
      <section>
        {@render sectionBody(section.group, index)}
      </section>
    {/each}

    {#if noLabelGroup}
      <section>
        {@render sectionBody(noLabelGroup, null)}
      </section>
    {/if}
  </div>
{/if}
