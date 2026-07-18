// App-wide compact-layout flag. Rendering one calendar layout at a time keeps dnd
// zone registration unambiguous.
//
// One module-level matchMedia listener serves all views (the SPA has no SSR).
import { COMPACT_MAX_WIDTH } from './constants'

const query = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH}px)`)
let compact = $state(query.matches)
query.addEventListener('change', (e) => (compact = e.matches))

export function isCompact(): boolean {
  return compact
}
