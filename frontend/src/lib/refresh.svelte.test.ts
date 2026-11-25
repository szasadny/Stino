import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { bumpRefresh, onRefresh } from './refresh.svelte'

describe('onRefresh', () => {
  it('skips the mount, then reloads once per flushed bump', () => {
    const reload = vi.fn()
    const cleanup = $effect.root(() => onRefresh(reload))
    flushSync()
    expect(reload).not.toHaveBeenCalled()

    bumpRefresh()
    flushSync()
    expect(reload).toHaveBeenCalledOnce()

    bumpRefresh()
    bumpRefresh()
    flushSync()
    expect(reload).toHaveBeenCalledTimes(2)
    cleanup()
  })

  it('stops reloading once its owner is gone', () => {
    const reload = vi.fn()
    const cleanup = $effect.root(() => onRefresh(reload))
    flushSync()
    cleanup()
    bumpRefresh()
    flushSync()
    expect(reload).not.toHaveBeenCalled()
  })
})
