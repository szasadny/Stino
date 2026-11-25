import { describe, expect, it, vi } from 'vitest'
import { REFRESH_FAILED_MESSAGE } from '../messages'
import { createLock } from './lock.svelte'

function deferred() {
  let resolve: () => void = () => {}
  let reject: (err: unknown) => void = () => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

  it('reports a failure with the thrown message and releases the lock', async () => {
    const lock = createLock()
    expect(await lock.run(() => Promise.reject(new Error('boom')), 'fail')).toBe(false)
    expect(lock.error).toBe('boom')
    expect(lock.pending).toBe(false)
  })

  it('falls back to the given message for a non-Error throw', async () => {
    const lock = createLock()
    await lock.run(() => Promise.reject('nope'), 'Could not save')
    expect(lock.error).toBe('Could not save')
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
        return Promise.reject(new Error('down'))
      },
      'fail',
      () => order.push(`revert:${lock.error ?? 'none'}`),
    )
    expect(ok).toBe(false)
    expect(order).toEqual(['apply', 'persist', 'revert:none'])
    expect(lock.error).toBe('down')
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
    const ok = await lock.save(() => Promise.reject(new Error('write')), after, 'fail')
    expect(ok).toBe(false)
    expect(after).not.toHaveBeenCalled()
    expect(lock.error).toBe('write')
  })
})
