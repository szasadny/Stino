import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { IMPORT_FAILED } from '../../lib/messages'
import { bumpRefresh } from '../../lib/refresh.svelte'
import type { ImportSummary } from '../../lib/types'
import { createImport, describeImport } from './import.svelte'

vi.mock('../../lib/api', () => ({ api: { import: { ticktick: vi.fn() } } }))
vi.mock('../../lib/refresh.svelte', () => ({ bumpRefresh: vi.fn() }))

const csv = () => new File(['Title'], 'backup.csv', { type: 'text/csv' })

const summary = (tasks: number, labels = 0, completions = 0, skipped = 0): ImportSummary => ({
  created: { tasks, labels, completions },
  skipped,
})

describe('describeImport', () => {
  it.each([
    [summary(1), 'Imported 1 task.'],
    [summary(3, 2), 'Imported 3 tasks and 2 labels.'],
    [summary(3, 1, 4), 'Imported 3 tasks, 1 label and 4 already done.'],
    [summary(0, 0, 2), 'Imported 0 tasks and 2 already done.'],
  ])('summarises %o', (s, text) => {
    expect(describeImport(s)).toBe(text)
  })
})

describe('createImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('imports the picked file and resets for another one', async () => {
    vi.mocked(api.import.ticktick).mockResolvedValue(summary(2))
    const importer = createImport()
    expect(await importer.run()).toBe(false)
    importer.pick(csv())
    expect(await importer.run()).toBe(true)
    expect(importer.summary).toEqual(summary(2))
    expect(importer.reset()).toBe(true)
    expect([importer.file, importer.summary]).toEqual([null, null])
    expect(bumpRefresh).toHaveBeenCalledOnce()
  })

  it('keeps an in-flight import across a reset and refuses a second run', async () => {
    let land: (s: ImportSummary) => void = () => {}
    vi.mocked(api.import.ticktick).mockReturnValue(new Promise((resolve) => (land = resolve)))
    const importer = createImport()
    importer.pick(csv())
    const first = importer.run()

    expect(importer.reset()).toBe(false)
    expect(bumpRefresh).not.toHaveBeenCalled()
    expect([importer.pending, importer.file?.name]).toEqual([true, 'backup.csv'])
    importer.pick(csv())
    expect(await importer.run()).toBe(false)
    expect(api.import.ticktick).toHaveBeenCalledOnce()

    land(summary(5))
    expect(await first).toBe(true)
    expect([importer.pending, importer.summary]).toEqual([false, summary(5)])
    expect(bumpRefresh).toHaveBeenCalledOnce()
  })

  it('reports a failed import', async () => {
    vi.mocked(api.import.ticktick).mockRejectedValue('bad csv')
    const importer = createImport()
    importer.pick(csv())
    expect(await importer.run()).toBe(false)
    expect(importer.error).toBe(IMPORT_FAILED)
    expect(bumpRefresh).not.toHaveBeenCalled()
  })
})
