// Input length caps, mirrored from the backend (`config.rs`) so the UI bounds
// what it sends. Keep in sync with the service-layer limits.
export const TITLE_MAX_LENGTH = 200
export const LABEL_NAME_MAX_LENGTH = 60

// How many task titles / dots a calendar cell shows before collapsing to a
// "+N more" affordance. The grid fills the viewport now, so cells are tall and
// can preview more; cells clip (overflow-hidden) so these stay safe on short
// windows. Month cells are denser (titles + dot overflow); the roomier week
// columns run the full height, so they cap higher.
export const MONTH_CELL_MAX_TITLES = 4
export const MONTH_CELL_MAX_DOTS = 5
export const WEEK_CELL_MAX_TITLES = 8

// svelte-dnd-action's FLIP animation duration (ms) for the drag-to-reorder
// lists — shared by every zone so reordering feels identical across the app.
export const DND_FLIP_MS = 150

// Debounce (ms) between a search keystroke and firing the request, so typing
// doesn't spray queries at the API.
export const SEARCH_DEBOUNCE_MS = 200

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
