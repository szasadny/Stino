// A single, app-wide reactive flag for "are we on a phone-width screen?" so the
// Month and Week views can render exactly ONE layout (the 7-column grid on a wide
// screen, the compact dot-grid / readable agenda on a phone). Rendering one layout
// — rather than CSS-toggling both — is what keeps svelte-dnd-action sound: two
// copies of a drag zone mounted at once corrupts its id-based tracking.
//
// Module-level state with a single matchMedia listener: this is a client-only SPA
// (no SSR), so reading `window` at import time is safe, and one listener for the
// whole app is cheaper than one per view. Exported through a getter because a
// reassigned `let` can't be exported as live reactive state.
import { COMPACT_MAX_WIDTH } from './constants'

const query = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH}px)`)
let compact = $state(query.matches)
query.addEventListener('change', (e) => (compact = e.matches))

export function isCompact(): boolean {
  return compact
}
