// Input length caps, mirrored from the backend (`config.rs`) so the UI bounds
// what it sends. Keep in sync with the service-layer limits.
export const TITLE_MAX_LENGTH = 200
export const LABEL_NAME_MAX_LENGTH = 60

// The viewport width (px) at/below which the calendar views switch to their
// compact, phone-friendly layouts (a dot grid + readable agenda) instead of the
// 7-column grids, whose cells are too narrow for task text on a phone. 639 keeps
// the break aligned with Tailwind's `sm` (640px) used everywhere else. Read via
// `lib/viewport.svelte.ts`'s `isCompact()`.
export const COMPACT_MAX_WIDTH = 639

// svelte-dnd-action's FLIP animation duration (ms) for the drag-to-reorder
// lists — shared by every zone so reordering feels identical across the app.
export const DND_FLIP_MS = 150

// Press-and-hold (ms) before a touch turns into a drag on the phone day-sheet
// reorder list (svelte-dnd-action `delayTouchStart`). Long enough that a quick tap
// still opens/toggles the task and a scroll still scrolls, short enough that a
// deliberate hold to reorder feels responsive. Touch-only — mouse drag is immediate.
export const DND_TOUCH_HOLD_MS = 250

// Press-and-hold (ms) before a touch turns into a drag on the month/week calendar
// pill zones (CalendarCell, WeekDayCell, DayPanel) — shorter than the day-sheet reorder
// hold because a grid pill has no competing tap action to protect (its tap edits, and a
// drag reads clearly from the pill). Shared so every calendar `type: 'calendar'` zone
// arms identically. Touch-only — mouse drag is immediate.
export const DND_GRID_TOUCH_HOLD_MS = 150

// Phone Month split view: hold a dragged task this close (px) to the bottom of the view,
// for this long (ms), to hide the day agenda so the WHOLE month grid becomes the drop
// surface. The dwell keeps a reorder-to-last-place drag (which passes through the same
// strip) from collapsing the list by accident; once triggered it sticks until the drop.
export const MONTH_EXPAND_ZONE_PX = 64
export const MONTH_EXPAND_HOLD_MS = 250

// Window (ms) after a touch tap opens the day-sheet editor during which we swallow the
// one stray "compatibility" click a phone emits (the dnd delay-touch path fires its own
// synthetic tap→click AND the browser's native one). Just long enough to catch that
// phantom, short enough it can never eat a later intentional click. See lib/phantom-click.
export const GHOST_CLICK_WINDOW_MS = 350

// Debounce (ms) between a search keystroke and firing the request, so typing
// doesn't spray queries at the API.
export const SEARCH_DEBOUNCE_MS = 200

// Inbox completion send-off. Ticking an inbox task doesn't yank the row: it holds
// for HOLD_MS playing the completion sequence (checkbox pop + pine ring ripple,
// the strike-through line drawing across the title, a soft pine wash over the
// row — keyframes in app.css), then leaves over EXIT_MS (the row folds shut while
// fading and drifting right). The hold covers the ~600ms the ring + strike need.
// If a mutation is still in flight when the hold ends, the removal re-checks every
// RETRY_MS instead of racing the shared lock (which would bounce the row back).
// Under prefers-reduced-motion the animations are skipped and removal is instant.
export const INBOX_COMPLETE_HOLD_MS = 750
export const INBOX_COMPLETE_EXIT_MS = 350
export const INBOX_COMPLETE_RETRY_MS = 150

// The shared base styling for a text input/textarea — the border, fog fill, and
// pine focus ring every form field uses. Callers prepend only layout (width,
// padding overrides) so the look stays in one place. Design tokens only (Hard
// Rule 6).
export const INPUT_CLASS =
  'rounded-lg border border-lichen bg-fog px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sage hover:border-sage/50 focus:border-pine focus:bg-surface focus:ring-2 focus:ring-pine/20'

// The shared look for the primary (pine) action button — a clean solid fill that
// darkens on hover, defined once so every CTA matches. Minimal by design.
// Callers prepend only layout (flex, padding, width); design tokens only.
export const PRIMARY_BTN_CLASS =
  'rounded-lg bg-pine text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40'

// The shared drop-target highlight svelte-dnd-action applies while a drag hovers
// a zone — the pine ring + tint every drop zone shows. Callers prepend only their
// own corner radius (rounded-md cells vs rounded-lg list rows); design tokens only.
export const DROP_TARGET_RING_CLASSES = ['ring-2', 'ring-inset', 'ring-pine/40', 'bg-pine/5']

// The tabbed views. Search is not a tab — it opens as an overlay from the
// header's search icon (see SearchDialog), so you can search from anywhere.
export type ViewId = 'month' | 'week' | 'today' | 'inbox'

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

// The fixed, nature-derived label palette. Defined once in `palette.js` (the one
// place the hexes live, shared with tailwind.config.js) and re-exported here so
// the rest of the UI keeps importing it from `constants`.
export { LABEL_PALETTE } from './palette.js'

// A label may carry one optional emoji. The input accepts any typed/pasted
// glyph; these are just quick-pick suggestions, kept short and broadly useful.
// Mirrors the backend cap in `config.rs` (MAX_LABEL_EMOJI_LEN).
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
