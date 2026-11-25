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
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        lichen: 'rgb(var(--lichen) / <alpha-value>)',
        scrim: 'rgb(var(--scrim) / var(--scrim-alpha))',
      },
      backdropBlur: {
        scrim: 'var(--scrim-blur)',
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
        emoji: ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'sans-serif'],
      },
      fontSize: {
        wordmark: '1.35rem',
        '2xs': '0.6875rem',
        '3xs': '0.625rem',
      },
      zIndex: {
        sticky: '10',
        chrome: '20',
        popover: '20',
        floating: '30',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / 0.05), 0 2px 8px rgb(var(--shadow) / 0.06)',
        lift: '0 2px 6px rgb(var(--shadow) / 0.07), 0 10px 24px rgb(var(--shadow) / 0.10)',
        overlay:
          '0 4px 14px rgb(var(--shadow-deep) / 0.14), 0 16px 40px rgb(var(--shadow-deep) / 0.22)',
      },
    },
  },
  plugins: [],
}
