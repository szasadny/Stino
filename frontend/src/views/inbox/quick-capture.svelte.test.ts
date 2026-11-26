import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { createTaskCore, type TaskCore } from '../../lib/controllers/task-core.svelte'
import { ApiError } from '../../lib/errors'
import { LOAD_FAILED } from '../../lib/messages'
import { makeLabel, makeTask } from '../../lib/test/factories'
import type { TaskInput } from '../../lib/types'
import { createQuickCapture, type QuickCapture } from './quick-capture.svelte'

vi.mock('../../lib/api', () => ({
  api: {
    labels: { list: vi.fn(), create: vi.fn() },
    tasks: { create: vi.fn() },
  },
}))

const home = makeLabel({ id: 1, name: 'Home' })
const gym = makeLabel({ id: 9, name: 'Gym', sort_order: 1 })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const key = (k: string) => ({ key: k, preventDefault: vi.fn() })

describe('createQuickCapture', () => {
  let core: TaskCore
  let capture: QuickCapture
  let onScheduled: ReturnType<typeof vi.fn<(dueDate: string) => void>>
  let cleanup: () => void

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(api.labels.list).mockResolvedValue([home])
    vi.mocked(api.labels.create).mockResolvedValue(gym)
    vi.mocked(api.tasks.create).mockImplementation(async (input: TaskInput) =>
      makeTask({ id: 5, title: input.title, label_id: input.label_id, due_date: input.due_date }),
    )
    onScheduled = vi.fn<(dueDate: string) => void>()
    cleanup = $effect.root(() => {
      core = createTaskCore()
      core.bindLoad(async () => [], LOAD_FAILED)
      capture = createQuickCapture(core, { onScheduled })
    })
    flushSync()
    await settle()
  })

  afterEach(() => cleanup())

  function type(text: string) {
    capture.text = text
    capture.onInput()
  }

  it('suggests labels for the #tag at the caret and steps through them', () => {
    type('buy #ho')
    expect(capture.menuOpen).toBe(true)
    expect(capture.suggestions).toEqual([
      { type: 'label', label: home },
      { type: 'create', name: 'ho' },
    ])

    const down = key('ArrowDown')
    capture.keydown(down)
    expect(down.preventDefault).toHaveBeenCalled()
    expect(capture.highlight).toBe(1)

    capture.keydown(key('Escape'))
    expect(capture.menuOpen).toBe(false)
    type('buy #hom')
    expect(capture.menuOpen).toBe(true)
    expect(capture.highlight).toBe(0)
  })

  it('leaves keys alone while the menu is closed', () => {
    type('buy milk')
    const enter = key('Enter')
    capture.keydown(enter)
    expect(enter.preventDefault).not.toHaveBeenCalled()
  })

  it('chooses a label with Enter, cutting the tag out of the text', async () => {
    type('buy #ho')
    capture.keydown(key('Enter'))
    await settle()
    expect(capture.text).toBe('buy ')
    expect(capture.label).toEqual({ label: home, chosen: true })
    expect(capture.menuOpen).toBe(false)

    capture.clearLabel()
    expect(capture.label).toBeNull()
  })

  it('creates the label behind a "create" row before choosing it', async () => {
    type('lift #Gym')
    await capture.choose({ type: 'create', name: 'Gym' })
    expect(api.labels.create).toHaveBeenCalledOnce()
    expect(capture.label).toEqual({ label: gym, chosen: true })
  })

  it('previews a typed tag as existing or pending', () => {
    type('sweep #home ')
    expect(capture.label).toEqual({ label: home, chosen: false })
    type('lift #gym ')
    expect(capture.label).toEqual({ pending: 'gym' })
  })

  it('adds an unscheduled capture to the list, creating its pending label, then resets', async () => {
    type('lift #gym ')
    await capture.submit()
    expect(api.tasks.create).toHaveBeenCalledWith({
      title: 'lift',
      label_id: 9,
      due_date: null,
      due_time: null,
      recurrence_rule: null,
    })
    expect(core.tasks.map((t) => t.id)).toEqual([5])
    expect(capture.text).toBe('')
    expect(capture.label).toBeNull()
    expect(onScheduled).not.toHaveBeenCalled()
  })

  it('does not list a capture that got a date, but reports its date', async () => {
    type('call mum tomorrow')
    expect(capture.preview).not.toBeNull()
    await capture.submit()
    expect(api.tasks.create).toHaveBeenCalledOnce()
    expect(core.tasks).toEqual([])
    expect(capture.text).toBe('')
    const dueDate = vi.mocked(api.tasks.create).mock.calls[0]?.[0].due_date
    expect(dueDate).toEqual(expect.any(String))
    expect(onScheduled).toHaveBeenCalledExactlyOnceWith(dueDate)
  })

  it('adds nothing when the pending label cannot be created', async () => {
    vi.mocked(api.labels.create).mockRejectedValueOnce(new ApiError('server'))
    type('lift #gym ')
    await capture.submit()
    expect(api.tasks.create).not.toHaveBeenCalled()
    expect(capture.text).toBe('lift #gym ')
  })

  it('hands the parsed draft to the details dialog with a resolved label', async () => {
    type('sweep #home ')
    expect(await capture.details()).toEqual({
      title: 'sweep',
      labelId: 1,
      date: '',
      time: '',
      rule: null,
    })

    vi.mocked(api.labels.create).mockRejectedValueOnce(new ApiError('server'))
    type('lift #run ')
    expect(await capture.details()).toBeNull()
  })
})
