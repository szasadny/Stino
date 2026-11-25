import { afterEach, describe, expect, it, vi } from 'vitest'
import { GROUP_VIEW_STORAGE_KEY } from './constants'

function loadWith(stored: string | null) {
  const store = new Map<string, string>()
  if (stored !== null) store.set(GROUP_VIEW_STORAGE_KEY, stored)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  })
  vi.resetModules()
  return { store, module: import('./group-view.svelte') }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('group-by-label view preference', () => {
  it.each([
    [null, true],
    ['1', true],
    ['0', false],
  ])('starts from stored %j as grouped=%s', async (stored, grouped) => {
    const { groupByLabelView } = await loadWith(stored).module
    expect(groupByLabelView()).toBe(grouped)
  })

  it('persists a switch to the list view and back', async () => {
    const { store, module } = loadWith(null)
    const { groupByLabelView, setGroupByLabelView } = await module
    setGroupByLabelView(false)
    expect([groupByLabelView(), store.get(GROUP_VIEW_STORAGE_KEY)]).toEqual([false, '0'])
    setGroupByLabelView(true)
    expect([groupByLabelView(), store.get(GROUP_VIEW_STORAGE_KEY)]).toEqual([true, '1'])
  })
})
