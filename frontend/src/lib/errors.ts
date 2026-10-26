import { REQUEST_FAILED_MESSAGE } from './constants'

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/** Reads the backend's `{"error": msg}` body. */
export function apiErrorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body
    if (typeof error === 'string') {
      return error
    }
  }
  return REQUEST_FAILED_MESSAGE
}
