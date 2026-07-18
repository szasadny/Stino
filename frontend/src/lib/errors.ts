// Convert thrown values to user-facing messages in one place.

/** The message from an `Error`, or `fallback` for anything else thrown. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
