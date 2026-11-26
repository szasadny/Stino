import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { ApiError } from './errors'

function respond(status: number, body: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })))
}

describe('api errors', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws a network error when no response arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.labels.list()).rejects.toMatchObject({ kind: 'network' })
  })

  it('hides the body of a server error', async () => {
    respond(500, JSON.stringify({ error: 'internal error' }))
    const result = api.labels.list()
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ kind: 'server', reason: null })
  })

  it('carries the backend reason of a rejected request', async () => {
    respond(409, JSON.stringify({ error: 'a label with that name already exists' }))
    await expect(api.labels.remove(1)).rejects.toMatchObject({
      kind: 'rejected',
      reason: 'a label with that name already exists',
    })
  })

  it('rejects without a reason when the body has none', async () => {
    respond(404, 'Not Found')
    await expect(api.labels.list()).rejects.toMatchObject({ kind: 'rejected', reason: null })
  })

  it('treats an unreadable success body as a server error', async () => {
    respond(200, '<html>')
    await expect(api.labels.list()).rejects.toMatchObject({ kind: 'server' })
  })
})
