<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { DndEvent } from 'svelte-dnd-action'
  import { api } from '../../lib/api'
  import { GHOST_BTN_CLASS } from '../../lib/constants'
  import { presses } from '../../lib/dnd/presses.action'
  import { tappedItem } from '../../lib/dnd/tap'
  import { scheduledNotice } from '../../lib/format'
  import { todayDate } from '../../lib/today.svelte'
  import {
    BATCH_EDIT,
    DELETE_TASK_TITLE,
    EDIT,
    INBOX,
    INBOX_EMPTY,
    INBOX_SUBTITLE,
    LOAD_INBOX_FAILED,
  } from '../../lib/messages'
  import type { Task } from '../../lib/types'
  import { createComposer, type ComposerChange } from '../../lib/controllers/composer.svelte'
  import { createDropList } from '../../lib/controllers/drop-list.svelte'
  import { createTaskCore } from '../../lib/controllers/task-core.svelte'
  import ComposerDialog from '../../lib/components/composer/ComposerDialog.svelte'
  import DeleteConfirm from '../../lib/components/DeleteConfirm.svelte'
  import ListViewShell from '../../lib/components/ListViewShell.svelte'
  import ReorderList from '../../lib/components/ReorderList.svelte'
  import TaskRow from '../../lib/components/TaskRow.svelte'
  import BulkBar from './BulkBar.svelte'
  import QuickCapture from './QuickCapture.svelte'
  import SelectableTaskRow from './SelectableTaskRow.svelte'
  import UndoToast from './UndoToast.svelte'
  import { foldAway } from './fold-away'
  import { createInboxComplete } from './inbox-complete.svelte'
  import { createInboxSelect } from './inbox-select.svelte'
  import { createQuickCapture } from './quick-capture.svelte'

  const core = createTaskCore()
  core.bindLoad(() => api.tasks.inbox(), LOAD_INBOX_FAILED)
  const complete = createInboxComplete(core)
  const capture = createQuickCapture(core, {
    onScheduled: (dueDate) => complete.notify(scheduledNotice(dueDate, todayDate())),
  })
  const select = createInboxSelect(core)
  const list = createDropList(() => ({ inbox: core.tasks }))

  // A task that gains a date leaves the Inbox.
  function landed(change: ComposerChange) {
    if (change.kind === 'created') capture.captured(change.task)
    else if (change.kind === 'deleted') core.dropIds([change.id])
    else if (change.task.due_date) core.dropIds([change.task.id])
    else core.patch(change.task)
  }
  const composer = createComposer(core, { afterSave: landed })

  function edit(task: Task) {
    core.clearError()
    composer.edit(task)
  }

  async function openDetails() {
    const initial = await capture.details()
    if (initial) composer.create(initial)
  }

  function finalize(event: CustomEvent<DndEvent<Task>>) {
    list.finalize('inbox', event.detail.items)
    const tapped = tappedItem(event.detail, presses.stationary)
    if (tapped) edit(tapped)
    else list.settle(core.reorder(list.lists.inbox.map((t) => t.id)))
  }
</script>

<ListViewShell
  title={INBOX}
  subtitle={INBOX_SUBTITLE}
  error={core.error}
  loading={core.loading}
  empty={core.tasks.length === 0}
  emptyMessage={INBOX_EMPTY}
  edgeScroll
>
  {#snippet top()}
    <QuickCapture {capture} busy={core.pending} onDetails={openDetails} />
  {/snippet}

  {#if select.active}
    <BulkBar {select} {core} />
    <ul class="mt-3 flex flex-col gap-2">
      {#each core.tasks as task (task.id)}
        <li>
          <SelectableTaskRow
            {task}
            label={core.labelFor(task)}
            selected={select.has(task.id)}
            onSelect={() => select.toggle(task.id)}
          />
        </li>
      {/each}
    </ul>
  {:else}
    <div class="mb-3 flex justify-end">
      <button
        type="button"
        onclick={select.enter}
        class="{GHOST_BTN_CLASS} min-h-11 px-2.5 py-1.5 text-xs sm:min-h-0"
      >
        {BATCH_EDIT}
      </button>
    </div>
    <ReorderList
      items={list.lists.inbox}
      disabled={core.pending}
      class="flex flex-col gap-2"
      onConsider={(e) => list.consider('inbox', e.detail.items)}
      onFinalize={finalize}
    >
      {#snippet item(task: Task, handle: Snippet | null)}
        {#snippet actions()}
          <button
            type="button"
            onclick={() => edit(task)}
            class="{GHOST_BTN_CLASS} px-2 py-1 text-xs"
          >
            {EDIT}
          </button>
          <DeleteConfirm
            onConfirm={() => core.remove(task.id)}
            title={DELETE_TASK_TITLE}
            detail={task.title}
            busy={core.pending}
            compact
          />
        {/snippet}
        <li out:foldAway={{ dragging: list.dragging }}>
          <TaskRow
            {task}
            label={core.labelFor(task)}
            completing={complete.isCompleting(task.id)}
            onToggle={() => complete.toggle(task)}
            onEdit={() => edit(task)}
            holdToDrag={handle == null}
            leading={handle ?? undefined}
            trailing={handle ? actions : undefined}
          />
        </li>
      {/snippet}
    </ReorderList>
  {/if}

  {#snippet overlay()}
    <UndoToast
      message={complete.message}
      busy={core.pending}
      onUndo={complete.undoable ? complete.undo : undefined}
    />
  {/snippet}
</ListViewShell>

<ComposerDialog {composer} />
