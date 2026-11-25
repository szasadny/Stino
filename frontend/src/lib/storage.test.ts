import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStored, writeStored } from './storage'

const blocked = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readStored / writeStored', () => {
  it('round-trips a value through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })
    writeStored('k', 'v')
    expect(readStored('k')).toBe('v')
    expect(readStored('missing')).toBeNull()
  })

  it('reads null and writes nothing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', blocked)
    expect(readStored('k')).toBeNull()
    expect(() => writeStored('k', 'v')).not.toThrow()
  })
})
