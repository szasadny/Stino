// The fixed, nature-derived label palette — the SINGLE frontend source of the
// label colors a user can assign. Imported by `constants.ts` (the UI swatches)
// and by `tailwind.config.js` (the `label.*` utility colors), so the hexes live
// in exactly one place on the frontend. Plain JS, not TS, because the Tailwind
// config is loaded outside the TypeScript pipeline and must be able to import it
// at runtime.
//
// The backend keeps its own copy (`backend/src/domain/label.rs`) for color
// validation — it can't import JS — and a unit test there guards it against
// drifting from this list. Keep the two in sync.
export const LABEL_PALETTE = [
  { name: 'pine', hex: '#2F5D50' },
  { name: 'moss', hex: '#6F8F6B' },
  { name: 'fern', hex: '#4F7A4A' },
  { name: 'clay', hex: '#B0714A' },
  { name: 'amber', hex: '#D8A24A' },
  { name: 'slate', hex: '#6E94A8' },
  { name: 'plum', hex: '#7C5A78' },
  { name: 'stone', hex: '#8A8F88' },
]
