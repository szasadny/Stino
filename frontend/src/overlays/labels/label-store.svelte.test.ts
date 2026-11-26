import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { ApiError } from '../../lib/errors'
import { NETWORK_ERROR_MESSAGE, SAVE_LABEL_ORDER_FAILED } from '../../lib/messages'
import { makeLabel } from '../../lib/test/factories'
import { createLabelStore } from './label-store.svelte'

vi.mock('../../lib/api', () => ({
  api: {
    labels: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
  },
}))

const HOME = makeLabel({ id: 1, name: 'Home' })
const WORK = makeLabel({ id: 2, name: 'Work', sort_order: 1 })

async function loaded() {
  vi.mocked(api.labels.list).mockResolvedValue([HOME, WORK])
  const store = createLabelStore()
  await store.load()
  return store
}

const ids = (store: { labels: { id: number }[] }) => store.labels.map((l) => l.id)

describe('createLabelStore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the labels and reports a failed load', async () => {
    const store = await loaded()
    expect([store.loading, ids(store)]).toEqual([false, [1, 2]])

    vi.mocked(api.labels.list).mockRejectedValueOnce(new ApiError('network'))
    await store.load()
    expect(store.error).toBe(NETWORK_ERROR_MESSAGE)
    expect(store.loading).toBe(false)
  })

  it('shows the loading state only until the labels first arrive', async () => {
    let land: (labels: (typeof HOME)[]) => void = () => {}
    vi.mocked(api.labels.list).mockReturnValue(new Promise((resolve) => (land = resolve)))
    const store = createLabelStore()
    const first = store.load()
    expect(store.loading).toBe(true)
    land([HOME])
    await first

    vi.mocked(api.labels.list).mockReturnValue(new Promise((resolve) => (land = resolve)))
    const reload = store.load()
    expect([store.loading, ids(store)]).toEqual([false, [1]])
    land([HOME, WORK])
    await reload
    expect(ids(store)).toEqual([1, 2])
  })

  it('keeps the loading state for a retry after a failed first load', async () => {
    vi.mocked(api.labels.list).mockRejectedValueOnce(new ApiError('server'))
    const store = createLabelStore()
    await store.load()
    vi.mocked(api.labels.list).mockReturnValue(new Promise(() => {}))
    void store.load()
    expect(store.loading).toBe(true)
  })

  it('creates, updates and removes through the lock', async () => {
    const store = await loaded()
    vi.mocked(api.labels.create).mockResolvedValue(makeLabel({ id: 3, name: 'Gym' }))
    vi.mocked(api.labels.update).mockResolvedValue({ ...HOME, name: 'House' })
    vi.mocked(api.labels.remove).mockResolvedValue()

    expect(await store.create({ name: 'Gym', color: HOME.color, emoji: null })).toBe(true)
    expect(await store.update(1, { name: 'House', color: HOME.color, emoji: null })).toBe(true)
    expect(await store.remove(2)).toBe(true)
    expect(store.labels.map((l) => l.name)).toEqual(['House', 'Gym'])
  })

  it('refuses a second write while one is in flight', async () => {
    const store = await loaded()
    let land: (label: typeof HOME) => void = () => {}
    vi.mocked(api.labels.create).mockReturnValue(new Promise((resolve) => (land = resolve)))
    const first = store.create({ name: 'Gym', color: HOME.color, emoji: null })
    expect(store.pending).toBe(true)
    expect(await store.remove(1)).toBe(false)
    expect(api.labels.remove).not.toHaveBeenCalled()
    land(makeLabel({ id: 3 }))
    expect(await first).toBe(true)
  })

  it('keeps the list and reports a failed create', async () => {
    const store = await loaded()
    vi.mocked(api.labels.create).mockRejectedValue(
      new ApiError('rejected', 'a label with that name already exists'),
    )
    expect(await store.create({ name: 'Home', color: HOME.color, emoji: null })).toBe(false)
    expect([ids(store), store.error]).toEqual([
      [1, 2],
      'Couldn’t create the label: a label with that name already exists.',
    ])
  })

  it('reorders optimistically and skips an unchanged order', async () => {
    const store = await loaded()
    vi.mocked(api.labels.reorder).mockResolvedValue()
    expect(await store.reorder([1, 2])).toBe(true)
    expect(api.labels.reorder).not.toHaveBeenCalled()

    expect(await store.reorder([2, 1])).toBe(true)
    expect(api.labels.reorder).toHaveBeenCalledWith([2, 1])
    expect(store.labels.map((l) => [l.id, l.sort_order])).toEqual([
      [2, 0],
      [1, 1],
    ])
  })

  it('reverts to the pre-drag order when saving the order fails', async () => {
    const store = await loaded()
    vi.mocked(api.labels.reorder).mockRejectedValue(new ApiError('server'))
    expect(await store.reorder([2, 1])).toBe(false)
    expect([ids(store), store.error]).toEqual([[1, 2], SAVE_LABEL_ORDER_FAILED])
  })
})
