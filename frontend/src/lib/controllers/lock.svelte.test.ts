import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import { NETWORK_ERROR_MESSAGE, REFRESH_FAILED_MESSAGE, SAVE_LABEL_FAILED } from '../messages'
import { deferred } from '../test/factories'
import { createLock } from './lock.svelte'

describe('createLock', () => {
  it('holds `pending` while a run is in flight and refuses a second run', async () => {
    const lock = createLock()
    const gate = deferred()
    const first = lock.run(() => gate.promise, 'fail')
    expect(lock.pending).toBe(true)
    const second = vi.fn(() => Promise.resolve())
    expect(await lock.run(second, 'fail')).toBe(false)
    expect(second).not.toHaveBeenCalled()
    gate.resolve()
    expect(await first).toBe(true)
    expect(lock.pending).toBe(false)
  })

  it('reports a rejected write with its reason and releases the lock', async () => {
    const lock = createLock()
    const rejected = new ApiError('rejected', 'a label with that name already exists')
    expect(await lock.run(() => Promise.reject(rejected), SAVE_LABEL_FAILED)).toBe(false)
    expect(lock.error).toBe('Couldn’t save the label: a label with that name already exists.')
    expect(lock.pending).toBe(false)
  })

  it.each([
    ['a network failure', new ApiError('network'), NETWORK_ERROR_MESSAGE],
    ['a server error', new ApiError('server'), SAVE_LABEL_FAILED],
    ['a non-API throw', new Error('boom'), SAVE_LABEL_FAILED],
  ])('reports %s', async (_, err, expected) => {
    const lock = createLock()
    await lock.run(() => Promise.reject(err), SAVE_LABEL_FAILED)
    expect(lock.error).toBe(expected)
  })

  it('clears a previous error when a new run starts', async () => {
    const lock = createLock()
    lock.fail('old')
    await lock.run(() => Promise.resolve(), 'fail')
    expect(lock.error).toBeNull()
  })

  it('applies optimistically, then reverts before reporting a failed persist', async () => {
    const lock = createLock()
    const order: string[] = []
    const ok = await lock.optimistic(
      () => order.push('apply'),
      () => {
        order.push('persist')
        return Promise.reject(new ApiError('server'))
      },
      'fail',
      () => order.push(`revert:${lock.error ?? 'none'}`),
    )
    expect(ok).toBe(false)
    expect(order).toEqual(['apply', 'persist', 'revert:none'])
    expect(lock.error).toBe('fail')
  })

  it('does not apply when the lock is already held', async () => {
    const lock = createLock()
    const gate = deferred()
    void lock.run(() => gate.promise, 'fail')
    const apply = vi.fn()
    expect(await lock.optimistic(apply, () => Promise.resolve(), 'fail', vi.fn())).toBe(false)
    expect(apply).not.toHaveBeenCalled()
    gate.resolve()
  })

  it('queues a write behind a held lock instead of dropping it, applying at once', async () => {
    const lock = createLock()
    const gate = deferred()
    const busy = lock.run(() => gate.promise, 'fail')
    const order: string[] = []
    const queued = lock.queue(
      () => order.push('apply'),
      () => {
        order.push('persist')
        return Promise.resolve()
      },
      'fail',
      vi.fn(),
    )
    expect(order).toEqual(['apply'])
    gate.resolve()
    expect(await busy).toBe(true)
    expect(lock.pending).toBe(true)
    expect(await queued).toBe(true)
    expect(order).toEqual(['apply', 'persist'])
    expect(lock.pending).toBe(false)
  })

  it('persists queued writes one at a time in order and stays pending until drained', async () => {
    const lock = createLock()
    const first = deferred()
    const second = deferred()
    const persistFirst = vi.fn(() => first.promise)
    const persistSecond = vi.fn(() => second.promise)
    const a = lock.queue(vi.fn(), persistFirst, 'fail', vi.fn())
    const b = lock.queue(vi.fn(), persistSecond, 'fail', vi.fn())
    expect([persistFirst.mock.calls.length, persistSecond.mock.calls.length]).toEqual([1, 0])
    first.resolve()
    expect(await a).toBe(true)
    expect([persistSecond.mock.calls.length, lock.pending]).toEqual([1, true])
    second.resolve()
    expect(await b).toBe(true)
    expect(lock.pending).toBe(false)
  })

  it('reverts only the failed queued write and keeps its error past a later success', async () => {
    const lock = createLock()
    const revertFirst = vi.fn()
    const revertSecond = vi.fn()
    const a = lock.queue(vi.fn(), () => Promise.reject(new ApiError('server')), 'fail', revertFirst)
    const b = lock.queue(vi.fn(), () => Promise.resolve(), 'fail', revertSecond)
    expect([await a, await b]).toEqual([false, true])
    expect([revertFirst.mock.calls.length, revertSecond.mock.calls.length]).toEqual([1, 0])
    expect(lock.error).toBe('fail')
  })

  it('still drops a run while queued writes are outstanding', async () => {
    const lock = createLock()
    const gate = deferred()
    const queued = lock.queue(vi.fn(), () => gate.promise, 'fail', vi.fn())
    const fn = vi.fn(() => Promise.resolve())
    expect(await lock.run(fn, 'fail')).toBe(false)
    expect(await lock.save(fn, vi.fn(), 'fail')).toBe(false)
    expect(fn).not.toHaveBeenCalled()
    gate.resolve()
    expect(await queued).toBe(true)
  })

  it('saves, then runs `after` with the result while still holding the lock', async () => {
    const lock = createLock()
    let pendingDuringAfter = false
    const ok = await lock.save(
      () => Promise.resolve(7),
      (n) => {
        pendingDuringAfter = lock.pending
        expect(n).toBe(7)
      },
      'fail',
    )
    expect(ok).toBe(true)
    expect(pendingDuringAfter).toBe(true)
  })

  it('treats a failing `after` as a landed write with a refresh warning', async () => {
    const lock = createLock()
    const ok = await lock.save(
      () => Promise.resolve(),
      () => Promise.reject(new Error('reload')),
      'fail',
    )
    expect(ok).toBe(true)
    expect(lock.error).toBe(REFRESH_FAILED_MESSAGE)
  })

  it('skips `after` when the write itself fails', async () => {
    const lock = createLock()
    const after = vi.fn()
    const ok = await lock.save(() => Promise.reject(new ApiError('server')), after, 'fail')
    expect(ok).toBe(false)
    expect(after).not.toHaveBeenCalled()
    expect(lock.error).toBe('fail')
  })
})
