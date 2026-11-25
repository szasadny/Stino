import { NETWORK_ERROR_MESSAGE, failureWithReason } from './messages'

type ApiErrorKind = 'network' | 'server' | 'rejected'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly reason: string | null

  constructor(kind: ApiErrorKind, reason: string | null = null) {
    super(reason ?? kind)
    this.name = 'ApiError'
    this.kind = kind
    this.reason = reason
  }
}

// Reads the backend's `{"error": msg}` body.
export function rejectionReason(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body
    if (typeof error === 'string') return error.trim() || null
  }
  return null
}

export function errorMessage(err: unknown, actionMessage: string): string {
  if (!(err instanceof ApiError)) return actionMessage
  if (err.kind === 'network') return NETWORK_ERROR_MESSAGE
  return err.kind === 'rejected' && err.reason
    ? failureWithReason(actionMessage, err.reason)
    : actionMessage
}
