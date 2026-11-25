import { api } from '../api'
import { taskToDraft, type ComposerDraft } from '../composer'
import {
  SUBMIT_ADD,
  DELETE_TASK_FAILED,
  EDIT_TASK_TITLE,
  NEW_TASK_TITLE,
  SUBMIT_SAVE,
  SAVE_TASK_FAILED,
} from '../messages'
import { canSkipOccurrence, isRecurring, skippableOccurrence } from '../tasks/predicates'
import type { Task, TaskInput } from '../types'
import type { TaskCore } from './task-core.svelte'

export type Composer = ReturnType<typeof createComposer>

export type ComposerChange =
  { kind: 'created' | 'updated'; task: Task } | { kind: 'deleted'; id: number }

type Editing = { mode: 'create'; initial: Partial<ComposerDraft> } | { mode: 'edit'; task: Task }

// `afterSave` runs under the lock once a write landed; the default reloads the bound view.
export function createComposer(
  core: TaskCore,
  options: { afterSave?: (change: ComposerChange) => unknown } = {},
) {
  const afterSave = options.afterSave ?? (() => core.reload())
  let editing = $state<Editing | null>(null)

  function close() {
    editing = null
  }

  async function submit(input: TaskInput): Promise<void> {
    const e = editing
    if (!e) return
    const persist = async (): Promise<ComposerChange> =>
      e.mode === 'create'
        ? { kind: 'created', task: await api.tasks.create(input) }
        : { kind: 'updated', task: await api.tasks.update(e.task.id, input) }
    if (await core.save(persist, afterSave, SAVE_TASK_FAILED)) close()
  }

  async function remove(): Promise<void> {
    if (editing?.mode !== 'edit') return
    const id = editing.task.id
    const deleted = await core.save(
      () => api.tasks.remove(id),
      () => afterSave({ kind: 'deleted', id }),
      DELETE_TASK_FAILED,
    )
    if (deleted) close()
  }

  async function removeOccurrence(): Promise<void> {
    if (editing?.mode !== 'edit') return
    const occurrence = skippableOccurrence(editing.task)
    if (occurrence == null || !canSkipOccurrence(editing.task)) return
    if (await core.removeOccurrence(editing.task.id, occurrence)) close()
  }

  return {
    create(initial: Partial<ComposerDraft> = {}) {
      editing = { mode: 'create', initial }
    },
    edit(task: Task) {
      editing = { mode: 'edit', task }
    },
    close,
    submit,
    get open() {
      return editing != null
    },
    get labels() {
      return core.labels
    },
    get pending() {
      return core.pending
    },
    get title() {
      return editing?.mode === 'create' ? NEW_TASK_TITLE : EDIT_TASK_TITLE
    },
    get submitLabel() {
      return editing?.mode === 'create' ? SUBMIT_ADD : SUBMIT_SAVE
    },
    get initial(): Partial<ComposerDraft> {
      if (editing?.mode === 'edit') return taskToDraft(editing.task)
      return editing?.initial ?? {}
    },
    get onDelete(): (() => Promise<void>) | undefined {
      return editing?.mode === 'edit' ? remove : undefined
    },
    get onDeleteOccurrence(): (() => Promise<void>) | undefined {
      return editing?.mode === 'edit' && skippableOccurrence(editing.task) != null
        ? removeOccurrence
        : undefined
    },
    get canDeleteOccurrence(): boolean {
      return editing?.mode !== 'edit' || canSkipOccurrence(editing.task)
    },
    get editingSeries(): boolean {
      return editing?.mode === 'edit' && isRecurring(editing.task)
    },
  }
}
