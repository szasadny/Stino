import { errorMessage } from '../errors'
import { REFRESH_FAILED_MESSAGE } from '../messages'

export function createLock() {
  let held = $state(0)
  let error = $state<string | null>(null)
  let tail: Promise<boolean> = Promise.resolve(true)

  // A failure stays visible past later queued successes; only an idle start clears it.
  function serial(
    fn: () => Promise<unknown>,
    failMsg: string,
    revert?: () => void,
  ): Promise<boolean> {
    if (held === 0) error = null
    held++
    async function attempt(): Promise<boolean> {
      try {
        await fn()
        return true
      } catch (err) {
        revert?.()
        error = errorMessage(err, failMsg)
        return false
      } finally {
        held--
      }
    }
    tail = held === 1 ? attempt() : tail.then(attempt)
    return tail
  }

  function run(fn: () => Promise<unknown>, failMsg: string, revert?: () => void): Promise<boolean> {
    if (held > 0) return Promise.resolve(false)
    return serial(fn, failMsg, revert)
  }

  return {
    get pending() {
      return held > 0
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

    // Never dropped: applies at once, persists after every earlier write.
    queue(
      apply: () => void,
      persist: () => Promise<unknown>,
      failMsg: string,
      revert: () => void,
    ): Promise<boolean> {
      apply()
      return serial(persist, failMsg, revert)
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
