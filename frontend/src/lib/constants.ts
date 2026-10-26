// Input caps mirrored from backend config.
export const TITLE_MAX_LENGTH = 200
export const LABEL_NAME_MAX_LENGTH = 60

// User-facing fallbacks when the API gives no message of its own.
export const NETWORK_ERROR_MESSAGE = 'Couldn’t reach Stinō — check your connection.'
export const REQUEST_FAILED_MESSAGE = 'Something went wrong. Please try again.'

// Just below Tailwind's 640px `sm` break.
export const COMPACT_MAX_WIDTH = 639

export const DND_FLIP_MS = 150

// Touch-only holds; mouse drags start immediately.
export const DND_TOUCH_HOLD_MS = 250
export const DND_GRID_TOUCH_HOLD_MS = 150

// Phone Month: dwell near the bottom to expose the full grid as a drop zone.
export const MONTH_EXPAND_ZONE_PX = 64
export const MONTH_EXPAND_HOLD_MS = 250

export const GHOST_CLICK_WINDOW_MS = 350

export const PLAUSIBLE_YEAR_MIN = 1900
export const PLAUSIBLE_YEAR_MAX = 2999

// Two years covers every-12-months shapes.
export const RECURRENCE_SNAP_MAX_DAYS = 731

export const SEARCH_DEBOUNCE_MS = 200

// Removal retries while a mutation is pending.
export const INBOX_COMPLETE_HOLD_MS = 750
export const INBOX_COMPLETE_EXIT_MS = 350
export const INBOX_COMPLETE_RETRY_MS = 150

export const UNDO_TOAST_MS = 5000

export const INPUT_CLASS =
  'rounded-lg border border-lichen bg-fog px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sage hover:border-sage/50 focus:border-pine focus:bg-surface focus:ring-2 focus:ring-pine/20'

export const PRIMARY_BTN_CLASS =
  'rounded-lg bg-pine text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40'

// `h-fit`, not `h-auto`: a modal <dialog> is inset-0, so `auto` stretches it to its max height.
export const SHEET_PANEL_CLASS =
  'm-2 h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none rounded-2xl sm:m-auto sm:h-fit sm:max-h-none'
export const SHEET_CONTAINER_CLASS = 'h-full sm:h-auto sm:max-h-[85vh]'

export const DROP_TARGET_RING_CLASSES = ['ring-2', 'ring-inset', 'ring-pine/40', 'bg-pine/5']

// Search is an overlay, not a tab.
export type ViewId = 'month' | 'week' | 'today' | 'inbox'

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

export { LABEL_PALETTE } from './palette.js'

// Cap mirrors backend config.
export const LABEL_EMOJI_MAX_LENGTH = 8
export const LABEL_EMOJI_SUGGESTIONS = [
  '🏠',
  '💼',
  '🌲',
  '🛒',
  '🏃',
  '📚',
  '💪',
  '🎵',
  '✈️',
  '🍳',
  '💡',
  '❤️',
] as const
