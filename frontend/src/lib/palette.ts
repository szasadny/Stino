// Mirrored by the backend's label validation (domain/label.rs).
export const LABEL_PALETTE = [
  { name: 'pine', hex: '#2F5D50' },
  { name: 'moss', hex: '#6F8F6B' },
  { name: 'fern', hex: '#4F7A4A' },
  { name: 'clay', hex: '#B0714A' },
  { name: 'amber', hex: '#D8A24A' },
  { name: 'slate', hex: '#6E94A8' },
  { name: 'plum', hex: '#7C5A78' },
  { name: 'stone', hex: '#8A8F88' },
] as const satisfies readonly { name: string; hex: `#${string}` }[]

export type PaletteHex = (typeof LABEL_PALETTE)[number]['hex']
