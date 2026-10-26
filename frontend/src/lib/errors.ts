// Convert thrown values to user-facing messages in one place.
import { REQUEST_FAILED_MESSAGE } from './constants'

/** The message from an `Error`, or `fallback` for anything else thrown. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/** The backend's `{"error": msg}` text from a parsed error body, else a generic message. */
export function apiErrorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body
    if (typeof error === 'string') {
      return error
    }
  }
  return REQUEST_FAILED_MESSAGE
}
