// Ignoring the row gap over-counts and clips lines; returns `total` until measured.
export function visibleLineCount(
  total: number,
  listHeight: number,
  lineHeight: number,
  gap = 0,
): number {
  if (total <= 0) return 0
  if (listHeight <= 0 || lineHeight <= 0) return total
  return Math.min(total, Math.floor((listHeight + gap) / (lineHeight + gap)))
}
