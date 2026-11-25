import { createContext } from 'svelte'
import type { CalendarBoard } from './calendar-board.svelte'
import type { CalendarSelection } from './calendar-selection.svelte'
import type { Composer } from './composer.svelte'
import type { TaskCore } from './task-core.svelte'

export interface CalendarContext {
  core: TaskCore
  board: CalendarBoard
  selection: CalendarSelection
  composer: Composer
}

export const [getCalendarContext, setCalendarContext] = createContext<CalendarContext>()
