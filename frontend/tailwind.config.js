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
        mist: 'rgb(var(--mist) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        lichen: 'rgb(var(--lichen) / <alpha-value>)',
        // Fixed, nature-derived label palette (mirrors src/lib/constants.ts).
        label: {
          pine: '#2F5D50',
          moss: '#6F8F6B',
          fern: '#4F7A4A',
          clay: '#B0714A',
          amber: '#D8A24A',
          slate: '#6E94A8',
          plum: '#7C5A78',
          stone: '#8A8F88',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
