<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { DndEvent } from 'svelte-dnd-action'
  import type { Task } from '../types'
  import type { TaskCore } from '../controllers/task-core.svelte'
  import { createDropList } from '../controllers/drop-list.svelte'
  import { DRAG_HANDLE_SIZE_CLASS, EYEBROW_CLASS } from '../constants'
  import { moveSectionLabel, NO_LABEL, SORT_TASKS } from '../messages'
  import { isCompact } from '../viewport.svelte'
  import { moveId } from '../labels'
  import { presses } from '../dnd/presses.action'
  import { tappedItem } from '../dnd/tap'
  import { dayViewGroups, hasLabelGroups, type TaskGroup } from '../tasks/projection'
  import { groupByLabelView } from '../group-view.svelte'
  import { untimedReadingOrder } from '../tasks/day-order'
  import { isUntimed, occurrenceKey } from '../tasks/predicates'
  import { completedLast } from '../tasks/sort'
  import GroupViewToggle from './GroupViewToggle.svelte'
  import IconButton from './IconButton.svelte'
  import LabelChip from './LabelChip.svelte'
  import ReorderList from './ReorderList.svelte'
  import TaskRow from './TaskRow.svelte'
  import Chevron from './icons/Chevron.svelte'

  let {
    core,
    tasks,
    onEdit,
    headingLevel,
  }: {
    core: TaskCore
    tasks: Task[]
    onEdit: (task: Task) => void
    headingLevel: 2 | 3
  } = $props()

  const canGroup = $derived(hasLabelGroups(tasks, core.labels))
  const grouped = $derived(groupByLabelView() && canGroup)
  const groups = $derived(dayViewGroups(tasks, core.labels, grouped))
  const compact = $derived(isCompact())

  const rowLabel = (task: Task) => (!grouped ? core.labelFor(task) : undefined)

  const keyOf = (group: TaskGroup) => (group.label ? String(group.label.id) : 'none')
  const timedOf = (group: TaskGroup, completed: boolean) =>
    group.tasks.filter((t) => !isUntimed(t) && t.completed === completed)

  type LabelSection = { id: number; group: TaskGroup }
  const labelSections = $derived<LabelSection[]>(
    groups.flatMap((g) => (g.label ? [{ id: g.label.id, group: g }] : [])),
  )
  const noLabelGroup = $derived(groups.find((g) => g.label == null) ?? null)

  function moveSection(index: number, delta: -1 | 1) {
    const ids = moveId(
      labelSections.map((s) => s.id),
      index,
      delta,
    )
    if (ids) void core.reorderLabels(ids)
  }

  const untimed = createDropList(() => {
    const next: Record<string, Task[]> = {}
    for (const group of groups) next[keyOf(group)] = completedLast(group.tasks.filter(isUntimed))
    return next
  })

  function finalize(key: string, e: CustomEvent<DndEvent<Task>>) {
    untimed.finalize(key, e.detail.items)
    const tapped = tappedItem(e.detail, presses.stationary)
    if (tapped) {
      onEdit(tapped)
      return
    }
    const liveGroups = groups.map((group) => ({
      label: group.label,
      tasks: untimed.lists[keyOf(group)] ?? [],
    }))
    untimed.settle(core.reorder(untimedReadingOrder(liveGroups)))
  }
</script>

<!-- Holds the drag handle's place, so timed and untimed rows share one checkbox column. -->
{#snippet handleSpace()}
  <span class={DRAG_HANDLE_SIZE_CLASS}></span>
{/snippet}

{#snippet timedList(list: Task[], classes: string)}
  {#if list.length > 0}
    <ul class="space-y-2 {classes}">
      {#each list as task (occurrenceKey(task))}
        <li>
          <TaskRow
            {task}
            label={rowLabel(task)}
            slim={compact}
            leading={compact ? undefined : handleSpace}
            onToggle={() => core.toggle(task)}
            onEdit={() => onEdit(task)}
          />
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet moveButton(name: string, index: number, delta: -1 | 1)}
  {@const dir = delta < 0 ? 'up' : 'down'}
  <IconButton
    label={moveSectionLabel(name, dir)}
    size="sm"
    class="hit-area-y"
    onclick={() => moveSection(index, delta)}
    disabled={index + delta < 0 || index + delta >= labelSections.length}
  >
    <Chevron {dir} class="h-4 w-4" />
  </IconButton>
{/snippet}

{#snippet sectionBody(group: TaskGroup, sectionIndex: number | null)}
  {@const key = keyOf(group)}
  {@const timed = timedOf(group, false)}
  {#if grouped}
    <div class="mb-2 flex items-center gap-1.5 px-0.5">
      <svelte:element this={`h${headingLevel}`} class="flex min-w-0">
        {#if group.label}
          <LabelChip label={group.label} />
        {:else}
          <span class="text-xs {EYEBROW_CLASS}">{NO_LABEL}</span>
        {/if}
      </svelte:element>
      {#if sectionIndex != null && labelSections.length > 1}
        <div class="ml-auto flex items-center gap-0.5">
          {@render moveButton(group.label?.name ?? '', sectionIndex, -1)}
          {@render moveButton(group.label?.name ?? '', sectionIndex, 1)}
        </div>
      {/if}
    </div>
  {/if}

  {@render timedList(timed, '')}

  <!-- One flat zone per label group (nested zones break dnd); distinct types block cross-group drops. -->
  <ReorderList
    items={untimed.lists[key] ?? []}
    type="untimed-{key}"
    disabled={core.pending}
    class="space-y-2 {timed.length > 0 ? 'mt-2' : ''}"
    onConsider={(e) => untimed.consider(key, e.detail.items)}
    onFinalize={(e) => finalize(key, e)}
  >
    {#snippet item(task: Task, handle: Snippet | null)}
      <li>
        <TaskRow
          {task}
          label={rowLabel(task)}
          slim={handle == null}
          holdToDrag={handle == null}
          leading={handle ?? undefined}
          onToggle={() => core.toggle(task)}
          onEdit={() => onEdit(task)}
        />
      </li>
    {/snippet}
  </ReorderList>

  {@render timedList(
    timedOf(group, true),
    (untimed.lists[key] ?? []).length > 0 || timed.length > 0 ? 'mt-2' : '',
  )}
{/snippet}

{#if canGroup}
  <div class="mb-3 flex justify-end">
    <GroupViewToggle label={SORT_TASKS} size="sm" />
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
