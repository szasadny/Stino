import { api } from '../api'
import { toISODate } from '../date'
import { navigateWithSlide } from '../nav-transition'
import { todayDate } from '../today.svelte'
import type { TaskCore } from './task-core.svelte'

export type PeriodNav = ReturnType<typeof createPeriodNav>

interface PeriodOptions {
  periodStart: (date: Date) => Date
  step: (start: Date, delta: number) => Date
  rangeFor: (start: Date) => [string, string]
  failMsg: string
  onNavigate?: () => void
}

// Call at component init; binds the core's load to the current period's range.
export function createPeriodNav(core: TaskCore, options: PeriodOptions) {
  const initial = options.periodStart(todayDate())
  let start = $state(initial)
  // Where the newest navigation is headed, so a second step taken mid-load builds on the first.
  let heading = initial

  core.bindLoad(() => api.tasks.range(...options.rangeFor(start)), options.failMsg)

  async function goTo(target: Date, dir: 'forward' | 'back' | null): Promise<void> {
    heading = target
    const [from, to] = options.rangeFor(target)
    try {
      await core.loadThrough(
        () => api.tasks.range(from, to),
        (commit) =>
          navigateWithSlide(dir, () => {
            start = target
            options.onNavigate?.()
            commit()
          }),
      )
    } finally {
      if (heading === target) heading = start
    }
  }

  return {
    get start() {
      return start
    },
    go(delta: number): Promise<void> {
      return goTo(options.step(heading, delta), delta > 0 ? 'forward' : 'back')
    },
    goToday(): Promise<void> {
      const target = options.periodStart(todayDate())
      const next = toISODate(target)
      const current = toISODate(start)
      return goTo(target, next > current ? 'forward' : next < current ? 'back' : null)
    },
  }
}
