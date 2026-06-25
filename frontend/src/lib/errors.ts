// One place to turn a thrown value into a user-facing message, so every view
// stops re-declaring the same two-line helper.

/** The message from an `Error`, or `fallback` for anything else thrown. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
