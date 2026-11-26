import { api } from '../../lib/api'
import { SEARCH_DEBOUNCE_MS } from '../../lib/constants'
import { createComposer } from '../../lib/controllers/composer.svelte'
import { createTaskCore } from '../../lib/controllers/task-core.svelte'
import type { TaskList } from '../../lib/controllers/toggles'
import { errorMessage } from '../../lib/errors'
import { LOAD_LABELS_FAILED, SEARCH_FAILED } from '../../lib/messages'
import { isRecurring } from '../../lib/tasks/predicates'
import { sortForSearch } from '../../lib/tasks/sort'
import { todayKey } from '../../lib/today.svelte'
import type { Task } from '../../lib/types'

export type Search = ReturnType<typeof createSearch>

const noTasks = async (): Promise<Task[]> => []

// Call at component init: the core loads the labels and owns the write lock.
export function createSearch() {
  const core = createTaskCore()
  core.bindLoad(noTasks, LOAD_LABELS_FAILED)

  let query = $state('')
  let results = $state<Task[]>([])
  let loading = $state(false)
  let searched = $state(false)
  let searchError = $state<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  // Only the newest query may land, so a slow response can't overwrite a newer one.
  let token = 0
  const list: TaskList = {
    read: () => results,
    write: (tasks) => (results = tasks),
    version: () => token,
  }

  $effect(() => () => {
    clearTimeout(timer)
    token++
  })

  function clearErrors() {
    searchError = null
    core.clearError()
  }

  async function run(term: string, mine: number): Promise<void> {
    clearErrors()
    try {
      const found = await api.search(term)
      if (mine !== token) return
      // Sorted on arrival only, so a ticked row stays under the pointer.
      results = sortForSearch(found, todayKey())
      searched = true
    } catch (err) {
      if (mine === token) searchError = errorMessage(err, SEARCH_FAILED)
    } finally {
      if (mine === token) loading = false
    }
  }

  function rerun(): Promise<void> {
    const term = query.trim()
    return term ? run(term, ++token) : Promise.resolve()
  }

  const composer = createComposer(core, { afterSave: rerun })

  return {
    core,
    composer,
    get query() {
      return query
    },
    get results() {
      return results
    },
    get loading() {
      return loading
    },
    get stale() {
      return loading && results.length > 0
    },
    get searched() {
      return searched
    },
    get error() {
      return searchError ?? core.error
    },

    input(value: string): void {
      query = value
      clearTimeout(timer)
      const mine = ++token
      const term = value.trim()
      if (!term) {
        results = []
        searched = false
        loading = false
        clearErrors()
        return
      }
      loading = true
      timer = setTimeout(() => void run(term, mine), SEARCH_DEBOUNCE_MS)
    },

    toggle(task: Task): Promise<boolean> {
      return core.toggleIn(list, task)
    },

    // A recurring row stands for its whole series, so there's no single occurrence to delete.
    edit(task: Task): void {
      composer.edit(isRecurring(task) ? { ...task, occurrence_date: null } : task)
    },
  }
}
