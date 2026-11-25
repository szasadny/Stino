import { api } from '../../lib/api'
import { createLock } from '../../lib/controllers/lock.svelte'
import { pluralize } from '../../lib/format'
import { IMPORT_FAILED } from '../../lib/messages'
import { bumpRefresh } from '../../lib/refresh.svelte'
import type { ImportSummary } from '../../lib/types'

function joinParts(parts: string[]): string {
  const last = parts.at(-1) ?? ''
  if (parts.length <= 1) return last
  return `${parts.slice(0, -1).join(', ')} and ${last}`
}

export function describeImport(summary: ImportSummary): string {
  const { tasks, labels, completions } = summary.created
  const parts = [pluralize(tasks, 'task')]
  if (labels > 0) parts.push(pluralize(labels, 'label'))
  if (completions > 0) parts.push(`${completions} already done`)
  return `Imported ${joinParts(parts)}.`
}

// Imports only add, so a run in flight survives close/reopen and blocks a second one.
export function createImport() {
  const lock = createLock()
  let file = $state<File | null>(null)
  let summary = $state<ImportSummary | null>(null)

  return {
    get file() {
      return file
    },
    get summary() {
      return summary
    },
    get pending() {
      return lock.pending
    },
    get error() {
      return lock.error
    },

    pick(next: File | null): void {
      file = next
      lock.clearError()
    },

    // False while an import is in flight: the dialog keeps showing it.
    reset(): boolean {
      if (lock.pending) return false
      file = null
      summary = null
      lock.clearError()
      return true
    },

    run(): Promise<boolean> {
      const picked = file
      if (!picked) return Promise.resolve(false)
      return lock.run(async () => {
        summary = await api.import.ticktick(picked)
        bumpRefresh()
      }, IMPORT_FAILED)
    },
  }
}
