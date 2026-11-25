import type { ThemePref, ViewId } from './types'

// Caps mirrored from backend config.rs.
export const TITLE_MAX_LENGTH = 200
export const LABEL_NAME_MAX_LENGTH = 60
export const LABEL_EMOJI_MAX_LENGTH = 8

export const API_BASE = '/api'
export const HTTP_SERVER_ERROR = 500

export const COMPACT_MAX_WIDTH = 639
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

export const DAYS_PER_WEEK = 7
export const MONTHS_PER_YEAR = 12
export const MONTH_GRID_CELLS = 42
export const MAX_MONTHDAY = 31

export const PLAUSIBLE_YEAR_MIN = 1900
export const PLAUSIBLE_YEAR_MAX = 2999

// Two years covers every-12-months shapes.
export const RECURRENCE_SNAP_MAX_DAYS = 731

export const DND_FLIP_MS = 150
export const DISCLOSURE_MS = 150

// Touch-only holds; mouse drags start immediately.
export const DND_TOUCH_HOLD_MS = 250
export const DND_GRID_TOUCH_HOLD_MS = 150

// A press that moves less than this is a tap, however long it is held.
export const TAP_SLOP_PX = 10

export const EDGE_SCROLL_ZONE_PX = 72
export const EDGE_SCROLL_MAX_STEP_PX = 14
// Overshoot allowed outside the container while the pointer aims at its edge.
export const EDGE_SCROLL_SLACK_PX = 40

// Horizontal must dominate vertical by SWIPE_RATIO so a diagonal scroll never flips the period.
export const SWIPE_THRESHOLD_PX = 50
export const SWIPE_RATIO = 1.5

// Phone Month: dwell near the bottom to expose the full grid as a drop zone.
export const MONTH_EXPAND_ZONE_PX = 64
export const MONTH_EXPAND_HOLD_MS = 250

export const PANEL_GAP_PX = 8
export const PANEL_MARGIN_PX = 8

export const SEARCH_DEBOUNCE_MS = 200

export const INBOX_COMPLETE_HOLD_MS = 750
export const INBOX_COMPLETE_EXIT_MS = 350
export const INBOX_FOLD_SLIDE_PX = 48
// Completion retries while a mutation is pending.
export const INBOX_COMPLETE_RETRY_MS = 150

export const UNDO_TOAST_MS = 5000

// The index.html bootstrap script reads the same key.
export const THEME_STORAGE_KEY = 'stino-theme'
export const GROUP_VIEW_STORAGE_KEY = 'stino-day-grouping'

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export const GROUP_VIEW_OPTIONS: { value: boolean; label: string }[] = [
  { value: false, label: 'List' },
  { value: true, label: 'By label' },
]

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

const INPUT_LOOK =
  'rounded-lg border border-lichen bg-fog text-ink outline-none transition placeholder:text-sage hover:border-sage/50 focus:border-pine focus:bg-surface focus:ring-2 focus:ring-pine/20'
export const INPUT_CLASS = `${INPUT_LOOK} px-3 py-2 text-sm`
export const COMPACT_INPUT_CLASS = `${INPUT_LOOK} px-2.5 py-1.5 text-sm`
export const TITLE_INPUT_CLASS = `${INPUT_LOOK} px-3 py-2.5 text-base font-medium placeholder:font-normal`
export const EMOJI_INPUT_CLASS = `${INPUT_LOOK} h-9 w-12 shrink-0 text-center text-lg`

export const PRIMARY_BTN_CLASS =
  'rounded-lg bg-pine text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40'
export const DESTRUCTIVE_BTN_CLASS =
  'rounded-lg font-medium text-bark transition hover:bg-bark/10 disabled:cursor-not-allowed disabled:opacity-40'
export const GHOST_BTN_CLASS =
  'rounded-lg text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep'
export const CLEAR_BTN_CLASS =
  'rounded-lg px-2 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark'
export const CHIP_ON_CLASS = 'border-pine bg-pine/10 text-pine'
export const CHIP_OFF_CLASS = 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'
export const FIELD_LABEL_CLASS = 'block text-xs font-medium text-sage'
export const MUTED_CENTER_CLASS = 'text-center text-sm text-sage'
export const POPOVER_CLASS =
  'absolute z-popover mt-1 max-h-60 w-full min-w-[11rem] overflow-y-auto rounded-lg border border-lichen bg-surface p-1 shadow-lift'
export const TODAY_CELL_CLASS = 'border-pine/50 bg-pine/[0.07] ring-1 ring-inset ring-pine/15'
export const OPEN_CELL_CLASS = 'ring-2 ring-inset ring-pine/50'

// `h-fit`, not `h-auto`: a modal <dialog> is inset-0, so `auto` stretches it to its max height.
const SHEET_PANEL =
  'm-2 h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none rounded-2xl sm:m-auto sm:h-fit sm:max-h-none'
const SHEET_CONTAINER = 'h-full sm:h-auto sm:max-h-[85vh]'

export const MODAL_SIZES = {
  sm: { panel: 'm-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl', container: '' },
  md: { panel: 'm-auto w-[min(30rem,calc(100vw-1.5rem))] rounded-2xl', container: '' },
  lg: {
    panel: 'm-auto max-h-[85vh] w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl',
    container: 'max-h-[85vh]',
  },
  xl: {
    panel: 'mx-auto mt-[8vh] max-h-[84vh] w-[min(40rem,calc(100vw-1.5rem))] rounded-2xl',
    container: 'max-h-[84vh]',
  },
  sheet: {
    panel: `${SHEET_PANEL} sm:w-[min(32rem,calc(100vw-1.5rem))] sm:max-w-[min(32rem,calc(100vw-1.5rem))]`,
    container: SHEET_CONTAINER,
  },
  'sheet-lg': {
    panel: `${SHEET_PANEL} sm:w-[min(34rem,calc(100vw-1.5rem))] sm:max-w-[min(34rem,calc(100vw-1.5rem))]`,
    container: SHEET_CONTAINER,
  },
} as const
export type ModalSize = keyof typeof MODAL_SIZES

export const DROP_TARGET_RING_CLASSES = ['ring-2', 'ring-inset', 'ring-pine/40', 'bg-pine/5']

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
