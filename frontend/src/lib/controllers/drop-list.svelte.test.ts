import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { createDropList } from './drop-list.svelte'

function setup() {
  let source = $state<Record<'a' | 'b', number[]>>({ a: [1, 2], b: [3] })
  let list: ReturnType<typeof createDropList<'a' | 'b', number>> | undefined
  const cleanup = $effect.root(() => {
    list = createDropList(() => ({ a: [...source.a], b: [...source.b] }))
  })
  flushSync()
  if (!list) throw new Error('drop list not created')
  return {
    list,
    cleanup,
    setSource(next: Record<'a' | 'b', number[]>) {
      source = next
      flushSync()
    },
  }
}

describe('createDropList', () => {
  it('starts from the source and follows it while idle', () => {
    const { list, setSource, cleanup } = setup()
    expect(list.lists.a).toEqual([1, 2])
    setSource({ a: [2], b: [3, 1] })
    expect(list.lists).toEqual({ a: [2], b: [3, 1] })
    cleanup()
  })

  it('keeps the in-flight order while a gesture is live', () => {
    const { list, setSource, cleanup } = setup()
    list.consider('a', [2, 1])
    expect(list.dragging).toBe(true)
    setSource({ a: [9], b: [] })
    expect(list.lists.a).toEqual([2, 1])
    cleanup()
  })

  it('re-projects on the next source change once the gesture ends', () => {
    const { list, setSource, cleanup } = setup()
    list.consider('a', [2, 1])
    list.finalize('a', [2, 1])
    expect(list.dragging).toBe(false)
    expect(list.lists.a).toEqual([2, 1])
    setSource({ a: [5], b: [] })
    expect(list.lists.a).toEqual([5])
    cleanup()
  })

  it('puts the source back when the write behind a drop did not land', async () => {
    const { list, cleanup } = setup()
    list.finalize('a', [2, 1])
    list.settle(Promise.resolve(true))
    await Promise.resolve()
    expect(list.lists.a).toEqual([2, 1])
    list.settle(Promise.resolve(false))
    await Promise.resolve()
    expect(list.lists.a).toEqual([1, 2])
    cleanup()
  })
})
