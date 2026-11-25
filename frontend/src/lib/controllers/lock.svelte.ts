import { errorMessage } from '../errors'
import { REFRESH_FAILED_MESSAGE } from '../messages'

export function createLock() {
  let pending = $state(false)
  let error = $state<string | null>(null)

  async function run(
    fn: () => Promise<unknown>,
    failMsg: string,
    revert?: () => void,
  ): Promise<boolean> {
    if (pending) return false
    pending = true
    error = null
    try {
      await fn()
      return true
    } catch (err) {
      revert?.()
      error = errorMessage(err, failMsg)
      return false
    } finally {
      pending = false
    }
  }

  return {
    get pending() {
      return pending
    },
    get error() {
      return error
    },
    clearError() {
      error = null
    },
    fail(message: string) {
      error = message
    },
    run,

    optimistic(
      apply: () => void,
      persist: () => Promise<unknown>,
      failMsg: string,
      revert: () => void,
    ): Promise<boolean> {
      return run(
        async () => {
          apply()
          await persist()
        },
        failMsg,
        revert,
      )
    },

    // Holds the lock through `after`, whose failure must not read as a failed write.
    save<T>(
      persist: () => Promise<T>,
      after: (result: T) => unknown,
      failMsg: string,
    ): Promise<boolean> {
      return run(async () => {
        const result = await persist()
        try {
          await after(result)
        } catch {
          error = REFRESH_FAILED_MESSAGE
        }
      }, failMsg)
    },
  }
}
