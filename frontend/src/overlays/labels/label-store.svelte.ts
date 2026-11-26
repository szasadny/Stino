import { api } from '../../lib/api'
import { createLock } from '../../lib/controllers/lock.svelte'
import {
  CREATE_LABEL_FAILED,
  DELETE_LABEL_FAILED,
  LOAD_LABELS_FAILED,
  SAVE_LABEL_FAILED,
  SAVE_LABEL_ORDER_FAILED,
} from '../../lib/messages'
import { applyLabelOrder } from '../../lib/tasks/optimistic'
import type { Label, LabelInput } from '../../lib/types'

export type LabelStore = ReturnType<typeof createLabelStore>

function sameOrder(labels: Label[], ids: number[]): boolean {
  return labels.length === ids.length && labels.every((l, i) => l.id === ids[i])
}

export function createLabelStore() {
  const lock = createLock()
  let labels = $state<Label[]>([])
  let loaded = false
  let loading = $state(true)

  return {
    get labels() {
      return labels
    },
    get loading() {
      return loading
    },
    get pending() {
      return lock.pending
    },
    get error() {
      return lock.error
    },
    clearError: lock.clearError,

    async load(): Promise<void> {
      loading = !loaded
      await lock.run(async () => {
        labels = await api.labels.list()
        loaded = true
      }, LOAD_LABELS_FAILED)
      loading = false
    },

    create(input: LabelInput): Promise<boolean> {
      return lock.run(async () => {
        labels = [...labels, await api.labels.create(input)]
      }, CREATE_LABEL_FAILED)
    },

    update(id: number, input: LabelInput): Promise<boolean> {
      return lock.run(async () => {
        const updated = await api.labels.update(id, input)
        labels = labels.map((l) => (l.id === id ? updated : l))
      }, SAVE_LABEL_FAILED)
    },

    remove(id: number): Promise<boolean> {
      return lock.run(async () => {
        await api.labels.remove(id)
        labels = labels.filter((l) => l.id !== id)
      }, DELETE_LABEL_FAILED)
    },

    reorder(ids: number[]): Promise<boolean> {
      if (sameOrder(labels, ids)) return Promise.resolve(true)
      const before = labels
      return lock.optimistic(
        () => {
          labels = applyLabelOrder(labels, ids)
        },
        () => api.labels.reorder(ids),
        SAVE_LABEL_ORDER_FAILED,
        () => {
          labels = before
        },
      )
    },
  }
}
