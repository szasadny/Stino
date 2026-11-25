import { OPEN_CELL_CLASS, TODAY_CELL_CLASS } from '../constants'

export function dayCellToneClass(isToday: boolean, inMonth: boolean, open: boolean): string {
  const tone = isToday
    ? TODAY_CELL_CLASS
    : inMonth
      ? 'border-lichen bg-cell'
      : 'border-lichen/70 bg-cell-out'
  return open ? `${tone} ${OPEN_CELL_CLASS}` : tone
}
