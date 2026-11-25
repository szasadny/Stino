import { describe, expect, it } from 'vitest'
import { ApiError, errorMessage, rejectionReason } from './errors'
import { NETWORK_ERROR_MESSAGE, SAVE_LABEL_FAILED } from './messages'

describe('errorMessage', () => {
  it('names the connection when no response arrived', () => {
    expect(errorMessage(new ApiError('network'), SAVE_LABEL_FAILED)).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('joins the action and the backend reason for a rejected request', () => {
    const err = new ApiError('rejected', 'a label with that name already exists')
    expect(errorMessage(err, SAVE_LABEL_FAILED)).toBe(
      'Couldn’t save the label: a label with that name already exists.',
    )
  })

  it.each([
    ['a server error', new ApiError('server')],
    ['a rejection without a reason', new ApiError('rejected')],
    ['a plain Error', new Error('boom')],
    ['a TypeError', new TypeError('Failed to fetch')],
    ['a thrown string', 'nope'],
    ['undefined', undefined],
    ['an error-like object', { kind: 'rejected', reason: 'fake', message: 'fake' }],
  ])('shows the action message alone for %s', (_, err) => {
    expect(errorMessage(err, SAVE_LABEL_FAILED)).toBe(SAVE_LABEL_FAILED)
  })
})

describe('rejectionReason', () => {
  it('reads the backend error text', () => {
    expect(rejectionReason({ error: ' title must not be empty ' })).toBe('title must not be empty')
  })

  it.each([[null], ['Internal Server Error'], [{ error: 500 }], [{ error: '  ' }], [{}]])(
    'finds no reason in %j',
    (body) => {
      expect(rejectionReason(body)).toBeNull()
    },
  )
})
