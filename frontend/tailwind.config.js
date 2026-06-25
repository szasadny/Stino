import { LABEL_PALETTE } from './src/lib/palette.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  // Dark mode follows the OS via prefers-color-scheme — the chrome tokens below
  // are CSS variables flipped in src/app.css, so no `dark:` utilities are needed.
  theme: {
    extend: {
      colors: {
        // Calm mountain-forest chrome — see CLAUDE.md § Design Language. Defined
        // as `rgb(var(--x) / <alpha-value>)` so `/opacity` modifiers still work
        // and the values can be themed for dark mode from one place (app.css).
        fog: 'rgb(var(--fog) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        pine: {
          DEFAULT: 'rgb(var(--pine) / <alpha-value>)',
          deep: 'rgb(var(--pine-deep) / <alpha-value>)',
        },
        moss: 'rgb(var(--moss) / <alpha-value>)',
        bark: 'rgb(var(--bark) / <alpha-value>)',
        // Calendar cell grounds (in-month / other-month). Swapped per theme in
        // app.css so the current month is the calm dark field in dark mode.
        cell: {
          DEFAULT: 'rgb(var(--cell) / <alpha-value>)',
          out: 'rgb(var(--cell-out) / <alpha-value>)',
        },
        mist: 'rgb(var(--mist) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        lichen: 'rgb(var(--lichen) / <alpha-value>)',
        // Fixed, nature-derived label palette, from the one shared source
        // (src/lib/palette.js) so the `label.*` utilities can't drift from the UI.
        label: Object.fromEntries(LABEL_PALETTE.map((p) => [p.name, p.hex])),
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Neutral grotesque for titles/wordmark — minimal, calm, a touch of warmth
        // (loaded in main.ts). See CLAUDE.md § Design Language.
        display: [
          'Hanken Grotesk Variable',
          'Inter Variable',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      // Soft, pine-tinted elevation — calm depth, never heavy gray boxes. The
      // tint is a fixed dark pine (not themed): in light it's a gentle green
      // shadow; in dark, depth comes from the lifted surface/borders instead.
      boxShadow: {
        soft: '0 1px 2px rgb(30 58 52 / 0.05), 0 2px 8px rgb(30 58 52 / 0.06)',
        lift: '0 2px 6px rgb(30 58 52 / 0.07), 0 10px 24px rgb(30 58 52 / 0.10)',
        overlay: '0 4px 14px rgb(20 40 34 / 0.14), 0 16px 40px rgb(20 40 34 / 0.22)',
      },
    },
  },
  plugins: [],
}
