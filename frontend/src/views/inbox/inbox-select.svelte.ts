import { SvelteSet } from 'svelte/reactivity'
import { api } from '../../lib/api'
import type { TaskCore } from '../../lib/controllers/task-core.svelte'
import { UPDATE_SELECTED_FAILED } from '../../lib/messages'
import type { BatchOp } from '../../lib/types'

export type InboxSelect = ReturnType<typeof createInboxSelect>

export function createInboxSelect(core: TaskCore) {
  let active = $state(false)
  const picked = new SvelteSet<number>()
  // A reload can drop picked tasks; only rows still listed count as selected.
  const ids = $derived(core.tasks.filter((t) => picked.has(t.id)).map((t) => t.id))
  const allSelected = $derived(core.tasks.length > 0 && ids.length === core.tasks.length)

  function exit(): void {
    active = false
    picked.clear()
  }

  async function run(op: BatchOp, apply: (ids: number[]) => void): Promise<void> {
    const chosen = ids
    if (chosen.length === 0) return
    await core.run(async () => {
      await api.tasks.batch(chosen, op)
      apply(chosen)
      exit()
    }, UPDATE_SELECTED_FAILED)
  }

  return {
    get active() {
      return active
    },
    get ids() {
      return ids
    },
    get allSelected() {
      return allSelected
    },
    has(id: number): boolean {
      return picked.has(id)
    },
    exit,

    enter(): void {
      active = true
      core.clearError()
    },

    toggle(id: number): void {
      if (picked.has(id)) picked.delete(id)
      else picked.add(id)
    },

    toggleAll(): void {
      if (allSelected) picked.clear()
      else for (const t of core.tasks) picked.add(t.id)
    },

    setLabel(labelId: number | null): Promise<void> {
      return run({ type: 'label', label_id: labelId }, (done) => {
        for (const t of core.tasks.filter((t) => done.includes(t.id)))
          core.patch({ ...t, label_id: labelId })
      })
    },

    schedule(date: string): Promise<void> {
      return run({ type: 'schedule', due_date: date }, core.dropIds)
    },

    complete(): Promise<void> {
      return run({ type: 'complete' }, core.dropIds)
    },

    remove(): Promise<void> {
      return run({ type: 'delete' }, core.dropIds)
    },
  }
}
