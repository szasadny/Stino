// Pure layout math for the phone month cell (CalendarCellMobile): given the
// measured available height and a measured per-line height, how many task lines
// should it render. Kept pure and unit-tested so the cell fits its content to any
// screen size with NO hardcoded line cap — the count is derived from real pixels.

/**
 * How many of `total` task lines to show in `listHeight` px, given a measured
 * per-line `lineHeight` px. Reserves one row for the "+N more" line when the full
 * set can't fit. Returns `total` while unmeasured (either dimension `<= 0`), so the
 * first paint shows everything (clipped by `overflow-hidden`) rather than a wrong
 * "+N more" before the ResizeObserver reports real sizes.
 */
export function visibleLineCount(total: number, listHeight: number, lineHeight: number): number {
  if (total <= 0) return 0
  if (listHeight <= 0 || lineHeight <= 0) return total
  const capacity = Math.floor(listHeight / lineHeight)
  return capacity >= total ? total : Math.max(0, capacity - 1)
}
