export type ViewId = 'month' | 'week' | 'today' | 'inbox' | 'search'

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'today', label: 'Today' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'search', label: 'Search' },
]

// Fixed, nature-derived label palette (mirrors the `label.*` colors in
// tailwind.config.js). Users pick a color from this set per label.
export const LABEL_PALETTE = [
  { name: 'pine', hex: '#2F5D50' },
  { name: 'moss', hex: '#6F8F6B' },
  { name: 'fern', hex: '#4F7A4A' },
  { name: 'clay', hex: '#B0714A' },
  { name: 'amber', hex: '#D8A24A' },
  { name: 'slate', hex: '#6E94A8' },
  { name: 'plum', hex: '#7C5A78' },
  { name: 'stone', hex: '#8A8F88' },
] as const
