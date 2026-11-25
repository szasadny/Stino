import { describe, expect, it } from 'vitest'
import { apiErrorMessage, errorMessage } from './errors'
import { REQUEST_FAILED_MESSAGE } from './messages'

describe('errorMessage', () => {
  it('uses an Error instance message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it.each([['nope'], [undefined], [{ message: 'fake' }]])(
    'falls back for %j, which is not an Error',
    (err) => {
      expect(errorMessage(err, 'fallback')).toBe('fallback')
    },
  )
})

describe('apiErrorMessage', () => {
  it('uses the backend error text', () => {
    expect(apiErrorMessage({ error: 'Title is required' })).toBe('Title is required')
  })

  it.each([[null], ['Internal Server Error'], [{ error: 500 }], [{}]])(
    'falls back for %j, which has no string error',
    (body) => {
      expect(apiErrorMessage(body)).toBe(REQUEST_FAILED_MESSAGE)
    },
  )
})
