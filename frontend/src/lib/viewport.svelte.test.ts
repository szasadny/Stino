import { afterEach, describe, expect, it, vi } from 'vitest'
import { COARSE_POINTER_QUERY, COMPACT_MAX_WIDTH } from './constants'

function loadMatching(queries: string[]) {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: queries.includes(query),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
  vi.resetModules()
  return import('./viewport.svelte')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('viewport', () => {
  it('is compact exactly at the COMPACT_MAX_WIDTH breakpoint query', async () => {
    const viewport = await loadMatching([`(max-width: ${COMPACT_MAX_WIDTH}px)`])
    expect([viewport.isCompact(), viewport.isCoarsePointer()]).toEqual([true, false])
  })

  it('reports a coarse pointer on its own', async () => {
    const viewport = await loadMatching([COARSE_POINTER_QUERY])
    expect([viewport.isCompact(), viewport.isCoarsePointer()]).toEqual([false, true])
  })
})
