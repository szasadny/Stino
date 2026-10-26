import { describe, expect, it } from 'vitest'
import { REQUEST_FAILED_MESSAGE } from './constants'
import { apiErrorMessage, errorMessage } from './errors'

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

describe('apiErrorMessage', () => {
  it('uses the backend error text', () => {
    expect(apiErrorMessage({ error: 'Title is required' })).toBe('Title is required')
  })

  it('falls back for bodies without a string error', () => {
    expect(apiErrorMessage(null)).toBe(REQUEST_FAILED_MESSAGE)
    expect(apiErrorMessage('Internal Server Error')).toBe(REQUEST_FAILED_MESSAGE)
    expect(apiErrorMessage({ error: 500 })).toBe(REQUEST_FAILED_MESSAGE)
    expect(apiErrorMessage({})).toBe(REQUEST_FAILED_MESSAGE)
  })
})
