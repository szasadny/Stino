// @vitest-environment node
import { describe, it } from 'vitest'
import { expectNone, readRepo } from './guards/repo'

const AA_TEXT = 4.5
const TEXT = ['ink', 'sage', 'pine', 'pine-deep', 'bark']
const GROUNDS = ['fog', 'surface', 'cell', 'cell-out']
const THEMES: [string, RegExp][] = [
  ['light', /:root \{([^}]*)\}/],
  ['dark', /:root\[data-theme='dark'\] \{([^}]*)\}/],
]

// WCAG 2 relative luminance of sRGB channels.
function luminance(channels: number[]): number {
  const [r = NaN, g = NaN, b = NaN] = channels.map((channel) => {
    const v = channel / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: number[], b: number[]): number {
  const [light = NaN, dark = NaN] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('design guards', () => {
  it('keeps every text token at AA contrast on every ground, in both themes', () => {
    const css = readRepo('frontend/src/app.css')
    const low = THEMES.flatMap(([theme, block]) => {
      const vars = block.exec(css)?.[1] ?? ''
      const channels = (token: string) =>
        new RegExp(`--${token}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`).exec(vars)?.slice(1).map(Number) ??
        []
      return TEXT.flatMap((text) =>
        GROUNDS.flatMap((ground) => {
          const ratio = contrast(channels(text), channels(ground))
          return ratio >= AA_TEXT ? [] : [`${theme}: ${text} on ${ground} is ${ratio.toFixed(2)}`]
        }),
      )
    })
    expectNone(
      low,
      `Text tokens must reach ${AA_TEXT}:1 on every ground token; adjust the token in src/app.css:`,
    )
  })
})
