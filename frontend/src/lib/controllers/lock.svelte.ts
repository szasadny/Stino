import { errorMessage } from '../errors'
import { REFRESH_FAILED_MESSAGE } from '../messages'

type Persisted<T> = { ok: true; value: T } | { ok: false }

export function createLock() {
  let held = $state(0)
  let error = $state<string | null>(null)
  let tail: Promise<unknown> = Promise.resolve()
  // A write counts from enqueue until its persist settles; a failed one may still have landed.
  let writing = 0
  let settled = 0
  const idleWaiters: (() => void)[] = []

  function startWrite(): () => void {
    writing++
    return () => {
      writing--
      settled++
      if (writing === 0) for (const wake of idleWaiters.splice(0)) wake()
    }
  }

  const writesIdle = (): Promise<void> =>
    writing === 0 ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve))

  // A failure stays visible past later queued successes; only an idle start clears it.
  // `tail` excludes `after`, so a reload there can wait out a tick queued behind it.
  async function serial<T>(
    persist: () => Promise<T>,
    failMsg: string,
    revert?: () => void,
    after?: (result: T) => unknown,
  ): Promise<boolean> {
    if (held === 0) error = null
    held++
    const end = startWrite()
    async function attempt(): Promise<Persisted<T>> {
      try {
        return { ok: true, value: await persist() }
      } catch (err) {
        revert?.()
        error = errorMessage(err, failMsg)
        return { ok: false }
      } finally {
        end()
      }
    }
    const persisted = held === 1 ? attempt() : tail.then(attempt, attempt)
    tail = persisted
    try {
      const outcome = await persisted
      if (outcome.ok && after) {
        try {
          await after(outcome.value)
        } catch {
          error = REFRESH_FAILED_MESSAGE
        }
      }
      return outcome.ok
    } finally {
      held--
    }
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
      if (held > 0) return Promise.resolve(false)
      return serial(persist, failMsg, undefined, after)
    },

    // Counts as a write for `read` without taking the lock.
    async unlocked<T>(persist: () => Promise<T>): Promise<T> {
      const end = startWrite()
      try {
        return await persist()
      } finally {
        end()
      }
    },

    // Fetches again until no write overlapped; `overlapped` stays true once a later write starts.
    async read<T>(
      fetch: () => Promise<T>,
      current: () => boolean,
    ): Promise<{ data: T; overlapped: () => boolean } | null> {
      while (current()) {
        const since = settled
        const overlapped = () => writing > 0 || settled !== since
        if (overlapped()) {
          await writesIdle()
          continue
        }
        const data = await fetch()
        if (current() && !overlapped()) return { data, overlapped }
      }
      return null
    },
  }
}
