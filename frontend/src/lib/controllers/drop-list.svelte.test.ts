import { flushSync } from 'svelte'
import { SOURCES, TRIGGERS } from 'svelte-dnd-action'
import { describe, expect, it } from 'vitest'
import { deferred, dndDetail } from '../test/factories'
import { createDropList } from './drop-list.svelte'

type Lists = Record<'a' | 'b', number[]>

function setup() {
  let source = $state<Lists>({ a: [1, 2], b: [3] })
  let list: ReturnType<typeof createDropList<'a' | 'b', number>> | undefined
  const cleanup = $effect.root(() => {
    list = createDropList(() => ({ a: [...source.a], b: [...source.b] }))
  })
  flushSync()
  if (!list) throw new Error('drop list not created')
  return {
    list,
    cleanup,
    setSource(next: Lists) {
      source = next
      flushSync()
    },
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const started = (items: number[], source = SOURCES.POINTER) =>
  dndDetail(items, TRIGGERS.DRAG_STARTED, '1', source)
const landed = (items: number[], source = SOURCES.POINTER) =>
  dndDetail(items, TRIGGERS.DROPPED_INTO_ZONE, '1', source)
const left = (items: number[], source = SOURCES.POINTER) =>
  dndDetail(items, TRIGGERS.DROPPED_INTO_ANOTHER, '1', source)
const noWrite = () => undefined

describe('createDropList', () => {
  it('starts from the source and follows it while idle', () => {
    const { list, setSource, cleanup } = setup()
    expect(list.lists.a).toEqual([1, 2])
    setSource({ a: [2], b: [3, 1] })
    expect(list.lists).toEqual({ a: [2], b: [3, 1] })
    cleanup()
  })

  it('ignores a source change while a gesture is live and applies it on release', () => {
    const { list, setSource, cleanup } = setup()
    list.consider('a', started([2, 1]))
    expect(list.dragging).toBe(true)
    setSource({ a: [9], b: [] })
    expect(list.lists).toEqual({ a: [2, 1], b: [3] })
    list.finalize('a', landed([2, 1]), noWrite)
    expect(list.dragging).toBe(false)
    expect(list.lists).toEqual({ a: [9], b: [] })
    cleanup()
  })

  it('snaps back to the source when a drop writes nothing', () => {
    const { list, cleanup } = setup()
    list.consider('a', started([2, 1]))
    list.finalize('a', landed([2, 1]), noWrite)
    expect(list.lists.a).toEqual([1, 2])
    cleanup()
  })

  it('keeps the dropped order until the write settles, then shows the source', async () => {
    const { list, setSource, cleanup } = setup()
    const write = deferred<boolean>()
    list.consider('a', started([2, 1]))
    list.finalize('a', landed([2, 1]), () => write.promise)
    setSource({ a: [1, 2, 5], b: [3] })
    expect(list.lists.a).toEqual([2, 1])
    write.resolve(true)
    await flush()
    expect(list.lists.a).toEqual([1, 2, 5])
    cleanup()
  })

  it('returns to the source when the write fails', async () => {
    const { list, cleanup } = setup()
    list.finalize('a', landed([2, 1]), () => Promise.resolve(false))
    expect(list.lists.a).toEqual([2, 1])
    await flush()
    expect(list.lists.a).toEqual([1, 2])
    list.finalize('a', landed([2, 1]), () => Promise.reject(new Error('offline')))
    await flush()
    expect(list.lists.a).toEqual([1, 2])
    cleanup()
  })

  it('ends a pointer drop at the landing zone, then records the zone it left', async () => {
    const { list, cleanup } = setup()
    const write = deferred<boolean>()
    list.consider('a', started([2]))
    list.finalize('b', landed([3, 1]), () => write.promise)
    list.finalize('a', left([2]), noWrite)
    expect(list.dragging).toBe(false)
    expect(list.lists).toEqual({ a: [2], b: [3, 1] })
    write.resolve(true)
    await flush()
    expect(list.lists).toEqual({ a: [1, 2], b: [3] })
    cleanup()
  })

  it('never re-holds when the zone it left reports after a drop with no write', () => {
    const { list, cleanup } = setup()
    list.consider('a', started([2]))
    list.finalize('b', landed([3, 1]), noWrite)
    list.finalize('a', left([2]), noWrite)
    expect(list.lists).toEqual({ a: [1, 2], b: [3] })
    cleanup()
  })

  it('does not ask the zone it left to commit', () => {
    const { list, cleanup } = setup()
    let commits = 0
    list.consider('a', started([2]))
    list.finalize('a', left([2]), () => {
      commits++
      return undefined
    })
    expect(commits).toBe(0)
    expect(list.dragging).toBe(true)
    cleanup()
  })

  it('keeps a keyboard drag live across its moves until the drag stops', async () => {
    const { list, setSource, cleanup } = setup()
    const write = deferred<boolean>()
    list.consider('a', started([1, 2], SOURCES.KEYBOARD))
    list.finalize('a', left([2], SOURCES.KEYBOARD), noWrite)
    list.finalize('b', landed([3, 1], SOURCES.KEYBOARD), () => write.promise)
    write.resolve(true)
    await flush()
    setSource({ a: [2], b: [3, 1, 7] })
    expect(list.dragging).toBe(true)
    expect(list.lists).toEqual({ a: [2], b: [3, 1] })
    list.consider('b', dndDetail([3, 1], TRIGGERS.DRAG_STOPPED, '1', SOURCES.KEYBOARD))
    expect(list.dragging).toBe(false)
    expect(list.lists).toEqual({ a: [2], b: [3, 1, 7] })
    cleanup()
  })

  it('holds a keyboard stop until the last move has saved', async () => {
    const { list, cleanup } = setup()
    const write = deferred<boolean>()
    list.consider('a', started([1, 2], SOURCES.KEYBOARD))
    list.finalize('a', landed([2, 1], SOURCES.KEYBOARD), () => write.promise)
    list.consider('a', dndDetail([2, 1], TRIGGERS.DRAG_STOPPED, '1', SOURCES.KEYBOARD))
    expect(list.lists.a).toEqual([2, 1])
    write.resolve(false)
    await flush()
    expect(list.lists.a).toEqual([1, 2])
    cleanup()
  })
})
