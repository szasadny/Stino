import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../errors'
import {
  EDIT_TASK_TITLE,
  NEW_TASK_TITLE,
  SAVE_TASK_FAILED,
  SUBMIT_ADD,
  SUBMIT_SAVE,
} from '../messages'
import { MON, TUE, makeTask, on, recurring } from '../test/factories'
import { createComposer, type ComposerChange } from './composer.svelte'
import { createTaskCore } from './task-core.svelte'

vi.mock('../api', () => ({
  api: {
    tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), skipOccurrence: vi.fn() },
  },
}))

describe('createComposer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seeds a create from the given draft and an edit from the task', () => {
    const composer = createComposer(createTaskCore())
    composer.create({ date: MON, title: 'gym' })
    expect([composer.title, composer.submitLabel]).toEqual([NEW_TASK_TITLE, SUBMIT_ADD])
    expect(composer.initial).toEqual({ date: MON, title: 'gym' })
    expect(composer.onDelete).toBeUndefined()
    expect(composer.editingTitle).toBeUndefined()

    composer.edit(on(MON, { id: 3, title: 'Read' }))
    expect([composer.title, composer.submitLabel]).toEqual([EDIT_TASK_TITLE, SUBMIT_SAVE])
    expect(composer.initial.title).toBe('Read')
    expect(composer.onDelete).toBeDefined()
    expect(composer.editingTitle).toBe('Read')
  })

  it('hands each landed write to `afterSave` and closes', async () => {
    const changes: ComposerChange[] = []
    const composer = createComposer(createTaskCore(), { afterSave: (c) => changes.push(c) })
    vi.mocked(api.tasks.create).mockResolvedValue(makeTask({ id: 4 }))
    vi.mocked(api.tasks.update).mockResolvedValue(makeTask({ id: 4, title: 'B' }))
    vi.mocked(api.tasks.remove).mockResolvedValue()

    composer.create()
    await composer.submit({ title: 'A' })
    composer.edit(makeTask({ id: 4 }))
    await composer.submit({ title: 'B' })
    composer.edit(makeTask({ id: 4 }))
    await composer.onDelete?.()

    expect(changes.map((c) => c.kind)).toEqual(['created', 'updated', 'deleted'])
    expect(composer.open).toBe(false)
  })

  it('stays open with the error when the write fails', async () => {
    const afterSave = vi.fn()
    const core = createTaskCore()
    const composer = createComposer(core, { afterSave })
    vi.mocked(api.tasks.create).mockRejectedValue(new ApiError('server'))
    composer.create()
    await composer.submit({ title: 'A' })
    expect(composer.open).toBe(true)
    expect([core.error, composer.error]).toEqual([SAVE_TASK_FAILED, SAVE_TASK_FAILED])
    expect(afterSave).not.toHaveBeenCalled()
  })

  it('clears a stale error when a create or an edit opens', async () => {
    const core = createTaskCore()
    const composer = createComposer(core)
    vi.mocked(api.tasks.create).mockRejectedValue(new ApiError('server'))
    composer.create()
    await composer.submit({ title: 'A' })
    composer.close()
    composer.create()
    expect(core.error).toBeNull()

    await composer.submit({ title: 'A' })
    composer.edit(on(MON, { id: 3 }))
    expect(core.error).toBeNull()
  })

  it('dismisses only an open form', () => {
    const composer = createComposer(createTaskCore())
    expect(composer.dismiss()).toBe(false)
    composer.create()
    expect(composer.dismiss()).toBe(true)
    expect(composer.open).toBe(false)
  })

  it('offers "this occurrence" only for an unfinished recurring occurrence', () => {
    const composer = createComposer(createTaskCore())
    composer.edit(recurring({ id: 2, occurrence_date: TUE }))
    expect(composer.onDeleteOccurrence).toBeDefined()
    expect(composer.canDeleteOccurrence).toBe(true)

    composer.edit(recurring({ id: 2, occurrence_date: TUE, completed: true }))
    expect(composer.canDeleteOccurrence).toBe(false)

    composer.edit(on(MON, { id: 5 }))
    expect(composer.onDeleteOccurrence).toBeUndefined()
  })

  it('flags a series edit, but not a recurring draft being created', () => {
    const composer = createComposer(createTaskCore())
    composer.create({ title: 'gym', date: MON, rule: 'FREQ=WEEKLY;BYDAY=MO' })
    expect(composer.editingSeries).toBe(false)
    composer.edit(recurring({ id: 2, occurrence_date: TUE }))
    expect(composer.editingSeries).toBe(true)
    composer.edit(on(MON, { id: 5 }))
    expect(composer.editingSeries).toBe(false)
  })

  it('skips one occurrence optimistically without `afterSave`', async () => {
    const afterSave = vi.fn()
    const composer = createComposer(createTaskCore(), { afterSave })
    vi.mocked(api.tasks.skipOccurrence).mockResolvedValue()
    composer.edit(recurring({ id: 2, occurrence_date: TUE }))
    await composer.onDeleteOccurrence?.()
    expect(api.tasks.skipOccurrence).toHaveBeenCalledWith(2, TUE)
    expect(afterSave).not.toHaveBeenCalled()
    expect(composer.open).toBe(false)
  })
})
