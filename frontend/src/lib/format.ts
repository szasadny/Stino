import { NOTHING_SCHEDULED } from './messages'

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function dayTaskCount(count: number): string {
  return count === 0 ? NOTHING_SCHEDULED : pluralize(count, 'task')
}
