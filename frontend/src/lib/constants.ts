// Input caps mirrored from backend config.
export const TITLE_MAX_LENGTH = 200
export const LABEL_NAME_MAX_LENGTH = 60

// Calendar views use their compact layout at or below Tailwind's 640px `sm` break.
export const COMPACT_MAX_WIDTH = 639

// Shared svelte-dnd-action FLIP duration.
export const DND_FLIP_MS = 150

// Touch hold before day-sheet reorder; mouse drags are immediate.
export const DND_TOUCH_HOLD_MS = 250

// Touch hold for calendar pill drags; mouse drags are immediate.
export const DND_GRID_TOUCH_HOLD_MS = 150

// Phone Month expansion trigger: dwell near the bottom to expose the full grid as a drop zone.
export const MONTH_EXPAND_ZONE_PX = 64
export const MONTH_EXPAND_HOLD_MS = 250

// Window for swallowing the duplicate click emitted after a touch edit (see phantom-click).
export const GHOST_CLICK_WINDOW_MS = 350

// Search request debounce.
export const SEARCH_DEBOUNCE_MS = 200

// Inbox completion animation timings. Removal retries while a mutation is pending.
export const INBOX_COMPLETE_HOLD_MS = 750
export const INBOX_COMPLETE_EXIT_MS = 350
export const INBOX_COMPLETE_RETRY_MS = 150

// Shared token-based input styling.
export const INPUT_CLASS =
  'rounded-lg border border-lichen bg-fog px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sage hover:border-sage/50 focus:border-pine focus:bg-surface focus:ring-2 focus:ring-pine/20'

// Shared primary action button styling.
export const PRIMARY_BTN_CLASS =
  'rounded-lg bg-pine text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40'

// Shared drop-target highlight classes.
export const DROP_TARGET_RING_CLASSES = ['ring-2', 'ring-inset', 'ring-pine/40', 'bg-pine/5']

// Search is an overlay, not a tab.
export type ViewId = 'month' | 'week' | 'today' | 'inbox'

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

// Re-export the palette's single source of truth.
export { LABEL_PALETTE } from './palette.js'

// Optional label emoji suggestions; cap mirrors backend config.
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
