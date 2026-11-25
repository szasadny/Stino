import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigateWithSlide } from './nav-transition'

const motion = vi.hoisted(() => ({ prefersReducedMotion: { current: false } }))
vi.mock('svelte/motion', () => motion)

interface FakeTransition {
  updateCallbackDone: Promise<void>
  finished: Promise<void>
}

function stubDom(withTransitions: boolean) {
  const dataset: Record<string, string> = {}
  const root = { dataset }
  const startViewTransition = (update: () => Promise<void>): FakeTransition => {
    const done = Promise.resolve().then(update)
    return { updateCallbackDone: done, finished: done }
  }
  vi.stubGlobal('document', {
    documentElement: root,
    startViewTransition: withTransitions ? startViewTransition : undefined,
  })
  return root
}

afterEach(() => {
  vi.unstubAllGlobals()
  motion.prefersReducedMotion.current = false
})

describe('navigateWithSlide', () => {
  it.each([true, false])('commits the new period (view transitions: %s)', async (supported) => {
    stubDom(supported)
    const apply = vi.fn()
    await navigateWithSlide('forward', apply)
    expect(apply).toHaveBeenCalledOnce()
  })

  it.each([true, false])(
    'surfaces an error thrown by the commit (view transitions: %s)',
    async (supported) => {
      stubDom(supported)
      const fail = () => {
        throw new Error('commit failed')
      }
      await expect(navigateWithSlide('back', fail)).rejects.toThrow('commit failed')
    },
  )

  it('commits without a slide when reduced motion is preferred', async () => {
    const root = stubDom(true)
    motion.prefersReducedMotion.current = true
    let duringCommit: string | undefined
    await navigateWithSlide('forward', () => {
      duringCommit = root.dataset.navDir
    })
    expect(duringCommit).toBeUndefined()
  })

  it('clears the slide direction once the transition ends, even after a failed commit', async () => {
    const root = stubDom(true)
    let duringCommit: string | undefined
    await navigateWithSlide('forward', () => {
      duringCommit = root.dataset.navDir
      throw new Error('commit failed')
    }).catch(() => undefined)
    expect(duringCommit).toBe('forward')
    expect(root.dataset.navDir).toBeUndefined()
  })
})
