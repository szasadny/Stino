import { describe, expect, it } from 'vitest'
import { labelLookup } from './labels'
import type { Label, Task } from './types'

const label = (id: number): Label => ({ id, name: `L${id}`, color: '#000000', sort_order: 0 })

const task = (label_id: number | null): Task => ({
  id: 1,
  title: 'T',
  notes: null,
  label_id,
  due_date: null,
  due_time: null,
  recurrence_rule: null,
  occurrence_date: null,
  sort_order: 0,
  completed: false,
})

describe('labelLookup', () => {
  const lookup = labelLookup([label(1), label(2)])

  it('finds the label a task carries', () => {
    expect(lookup(task(2))?.id).toBe(2)
  })

  it('returns undefined for a task with no label', () => {
    expect(lookup(task(null))).toBeUndefined()
  })

  it('returns undefined for a deleted/unknown label id', () => {
    expect(lookup(task(99))).toBeUndefined()
  })
})
