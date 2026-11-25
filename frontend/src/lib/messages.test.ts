import { describe, expect, it } from 'vitest'
import { deleteLabelTitle } from './messages'

describe('delete confirmation titles', () => {
  it('quotes the label name', () => {
    expect(deleteLabelTitle('Work')).toBe('Delete “Work”?')
  })
})
