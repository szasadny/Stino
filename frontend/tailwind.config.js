import { LABEL_PALETTE } from './src/lib/palette.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        fog: 'rgb(var(--fog) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        pine: {
          DEFAULT: 'rgb(var(--pine) / <alpha-value>)',
          deep: 'rgb(var(--pine-deep) / <alpha-value>)',
        },
        moss: 'rgb(var(--moss) / <alpha-value>)',
        bark: 'rgb(var(--bark) / <alpha-value>)',
        cell: {
          DEFAULT: 'rgb(var(--cell) / <alpha-value>)',
          out: 'rgb(var(--cell-out) / <alpha-value>)',
        },
        mist: 'rgb(var(--mist) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        lichen: 'rgb(var(--lichen) / <alpha-value>)',
        label: Object.fromEntries(LABEL_PALETTE.map((p) => [p.name, p.hex])),
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: [
          'Hanken Grotesk Variable',
          'Inter Variable',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(30 58 52 / 0.05), 0 2px 8px rgb(30 58 52 / 0.06)',
        lift: '0 2px 6px rgb(30 58 52 / 0.07), 0 10px 24px rgb(30 58 52 / 0.10)',
        overlay: '0 4px 14px rgb(20 40 34 / 0.14), 0 16px 40px rgb(20 40 34 / 0.22)',
      },
    },
  },
  plugins: [],
}
