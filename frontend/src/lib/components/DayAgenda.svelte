<script lang="ts">
  // A day's tasks grouped by label — the readable single-day view (Today and the
  // month/week day sheet). Each label is a section header (the chip), with its tasks
  // below; tasks with no label fall under a trailing "No label" group.
  //
  // Drag lives here in exactly ONE place, kept deliberately flat (the only pattern that
  // proved reliable — the Inbox uses it too): untimed tasks reorder within their group,
  // each group its own dndzone. Timed tasks are pinned by time, so they render first
  // without a handle. Cross-group drag is disabled (a distinct dnd `type` per group) —
  // that would mean relabeling, a different gesture. On a drop we emit the FULL day's
  // untimed ids in grouped reading order via `onReorder`, so every view (which sorts
  // untimed by sort_order) shows the same sequence this view reads top-to-bottom.
  //
  // Label-section ORDER is changed with up/down controls on the section header (via
  // `onReorderLabels`), NOT by dragging the whole section: a section contains its task
  // dndzone, so making the section draggable would nest one zone inside another, which
  // breaks the inner task drag. The order is global, so it changes label order
  // everywhere. The "No label" group is never reorderable and always renders last.
  import { untrack } from 'svelte'
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action'
  import type { Label, Task } from '../types'
  import { DND_FLIP_MS } from '../constants'
  import { groupByLabel, type TaskGroup } from '../grouping'
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

  const groups = $derived(groupByLabel(tasks, labels))
  const reorderable = $derived(onReorder != null)

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
    class="grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-sage transition hover:text-pine-deep active:cursor-grabbing"
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

  {#if timed.length > 0}
    <ul class="space-y-2">
      {#each timed as task (`${task.id}:${task.occurrence_date ?? ''}`)}
        <li>
          <TaskRow
            {task}
            onToggle={() => onToggle(task)}
            onEdit={onEdit ? () => onEdit(task) : undefined}
          />
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Untimed tasks: drag-to-reorder within this group. A distinct `type` keeps items
       from jumping to another group. The grip renders (and drag is enabled) only when a
       reorder handler is provided and no mutation is in flight. -->
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
{/snippet}

{#if groups.length === 0}
  <p class="py-6 text-center text-sm text-sage">No tasks on this day.</p>
{:else}
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
