import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('uses an Error instance message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('falls back for anything that is not an Error', () => {
    expect(errorMessage('nope', 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: 'fake' }, 'fallback')).toBe('fallback')
  })
})
