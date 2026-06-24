/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Calm mountain-forest chrome — see CLAUDE.md § Design Language.
        fog: '#F4F6F3',
        surface: '#FBFCFA',
        pine: { DEFAULT: '#2F5D50', deep: '#1E3A34' },
        moss: '#6F8F6B',
        bark: '#8B6F52',
        mist: '#8FB3C7',
        ink: '#2B332E',
        sage: '#6B7770',
        lichen: '#DDE3DD',
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
