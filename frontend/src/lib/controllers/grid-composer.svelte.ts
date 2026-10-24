// Shared Month/Week task-dialog state and CRUD routing through TaskCore.
import { api, type TaskInput } from '../api'
import { taskToDraft, type ComposerDraft } from '../composer'
import { canSkipOccurrence, skippableOccurrence } from '../task-actions'
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

  // Reload after persistence so recurrence expansion and server-assigned ids are current.
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

  // Delete just the edited recurring occurrence; the rest of the series stays.
  async function removeOccurrence(): Promise<void> {
    if (editing?.mode !== 'edit') return
    const occurrence = skippableOccurrence(editing.task)
    if (occurrence == null || !canSkipOccurrence(editing.task)) return
    if (await core.removeOccurrence(editing.task.id, occurrence)) editing = null
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
    // Present only when editing a recurring occurrence — Delete then asks occurrence vs series.
    get onDeleteOccurrence(): (() => void) | undefined {
      return editing?.mode === 'edit' && skippableOccurrence(editing.task) != null
        ? removeOccurrence
        : undefined
    },
    // False for a completed occurrence — it's history, so only the whole series can go.
    get canDeleteOccurrence(): boolean {
      return editing?.mode !== 'edit' || canSkipOccurrence(editing.task)
    },
  }
}
