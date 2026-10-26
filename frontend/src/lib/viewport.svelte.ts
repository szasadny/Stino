// Views render ONE layout from this, never both via CSS, so dnd zones never duplicate.
import { COMPACT_MAX_WIDTH } from './constants'

const query = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH}px)`)
let compact = $state(query.matches)
query.addEventListener('change', (e) => (compact = e.matches))

export function isCompact(): boolean {
  return compact
}
