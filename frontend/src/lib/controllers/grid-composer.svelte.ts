// The add/edit task dialog for the calendar grid views (Month/Week), lifted into one
// place so the two views don't each re-implement it. A rune factory in the same grain as
// createCalendarBoard(core, keys, reload): it owns the small editor state and routes
// create/update/delete through the shared TaskCore lock, reloading the range on success
// (the server assigns the id / re-expands recurrence, so a refetch is the correct resync).
// It exposes the derived dialog props (open/title/submitLabel/initial/onDelete) so each
// view's <TaskComposerDialog> binding is a trivial pass-through.
import { api, type TaskInput } from '../api'
import { taskToDraft, type ComposerDraft } from '../composer'
import type { Task } from '../types'
import type { TaskCore } from './task-core.svelte'

export type GridComposer = ReturnType<typeof createGridComposer>

// 'add' prefills a day (the header "+"); 'edit' opens a tapped pill.
type Editing = { mode: 'add'; date: string } | { mode: 'edit'; task: Task }

export function createGridComposer(core: TaskCore, reload: () => Promise<void>) {
  let editing = $state<Editing | null>(null)

  function add(date: string) {
    editing = { mode: 'add', date }
  }
  function edit(task: Task) {
    editing = { mode: 'edit', task }
  }
  function close() {
    editing = null
  }

  // Create/update through the lock; a reload re-expands the range so the new/changed task
  // lands on the right day. Closes only on success — a failure stays open via core.error.
  async function submit(input: TaskInput): Promise<void> {
    const e = editing
    if (!e) return
    const persist =
      e.mode === 'add'
        ? () => api.tasks.create(input).then(() => {})
        : () => api.tasks.update(e.task.id, input).then(() => {})
    if (await core.save(persist, reload, 'Could not save the task')) editing = null
  }

  async function remove(): Promise<void> {
    if (editing?.mode !== 'edit') return
    const id = editing.task.id
    if (
      await core.save(
        () => api.tasks.remove(id).then(() => {}),
        reload,
        'Could not delete the task',
      )
    )
      editing = null
  }

  return {
    add,
    edit,
    close,
    submit,
    remove,
    get open() {
      return editing != null
    },
    get title() {
      return editing?.mode === 'add' ? 'New task' : 'Edit task'
    },
    get submitLabel() {
      return editing?.mode === 'add' ? 'Add' : 'Save'
    },
    get initial(): Partial<ComposerDraft> {
      if (editing?.mode === 'edit') return taskToDraft(editing.task)
      if (editing?.mode === 'add') return { date: editing.date }
      return {}
    },
    // Present only when editing — the dialog shows a Delete button when this is set.
    get onDelete(): (() => void) | undefined {
      return editing?.mode === 'edit' ? remove : undefined
    },
  }
}
