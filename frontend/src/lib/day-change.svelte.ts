import { onMount } from 'svelte'
import { api } from './api'
import { currentDateKey } from './date'
import { bumpRefresh } from './refresh.svelte'
import { setToday } from './today.svelte'

// "today" advances only after the rollover, so views reload with the moved tasks in place.
export function createDayChange() {
  let rolledOverOn = ''

  return {
    async check(): Promise<void> {
      const today = currentDateKey()
      let moved = 0
      if (today !== rolledOverOn) {
        try {
          moved = (await api.tasks.rollover(today)).moved
          rolledOverOn = today
        } catch {
          // Transient; views show their own load errors and the next check retries.
        }
      }
      if (setToday(today) || moved > 0) bumpRefresh()
    },
  }
}

// Call at component init. A tab often stays open across midnight, so returning to it re-checks.
export function watchDayChange(): void {
  const { check } = createDayChange()
  onMount(() => {
    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })
}
