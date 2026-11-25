import { dirname, relative, resolve, sep } from 'node:path'
import { defineConfig } from 'eslint/config'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import svelteConfig from './svelte.config.js'

const MAX_FILE_LINES = 300
const MAX_FUNCTION_LINES = 150
const SRC = resolve(import.meta.dirname, 'src')
const COMPOSER = 'lib/components/composer/'
const COMPOSER_ENTRIES = ['ComposerDialog.svelte', 'ComposerForm.svelte']
const PURE_MODULE = /^lib\/(tasks|recurrence|dnd)\/(?!.*\.(svelte|action)\.ts$)/
const TEST_FILES = ['src/**/*.test.ts', 'src/lib/test/**']
const FETCH_MESSAGE = 'HTTP goes through src/lib/api.ts only.'

const feature = (path) => /^(views|overlays)\/[^/]+\//.exec(path)?.[0]

function boundaryViolation(from, to) {
  const target = feature(to)
  if (target && target !== feature(from) && from !== 'App.svelte') {
    return `${target} is private to its folder (App.svelte mounts the entry); move shared code to lib/.`
  }
  if (PURE_MODULE.test(from) && to.replace(/\.ts$/, '') === 'lib/api') {
    return 'Pure helpers stay I/O-free; call lib/api from a controller or component instead.'
  }
  const composerPart = to.startsWith(COMPOSER) && to.slice(COMPOSER.length)
  if (composerPart && !from.startsWith(COMPOSER) && !COMPOSER_ENTRIES.includes(composerPart)) {
    return `Use the composer through ${COMPOSER_ENTRIES.join(' or ')}; its parts are internal.`
  }
  return undefined
}

const boundaries = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const from = relative(SRC, context.filename).split(sep).join('/')
    const check = ({ source }) => {
      if (typeof source?.value !== 'string' || !source.value.startsWith('.')) return
      const to = relative(SRC, resolve(dirname(context.filename), source.value))
        .split(sep)
        .join('/')
      const message = boundaryViolation(from, to)
      if (message) context.report({ node: source, message })
    }
    return {
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    }
  },
}

export default defineConfig(
  { ignores: ['dist/', 'coverage/'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  { files: ['src/**'], languageOptions: { globals: globals.browser } },
  { files: ['*.{js,ts}'], languageOptions: { globals: globals.node } },
  tseslint.configs.recommended,
  svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'], svelteConfig },
    },
  },
  {
    files: ['src/**/*.{ts,svelte}', '*.config.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
  {
    files: ['**/*.{js,ts,svelte}'],
    plugins: { stino: { rules: { boundaries } } },
    rules: {
      'stino/boundaries': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'svelte/valid-compile': 'error',
      'svelte/no-at-debug-tags': 'error',
      'svelte/no-inspect': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,svelte}'],
    ignores: ['src/lib/api.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: FETCH_MESSAGE }],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: FETCH_MESSAGE },
        { object: 'globalThis', property: 'fetch', message: FETCH_MESSAGE },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,svelte}'],
    ignores: TEST_FILES,
    rules: {
      'max-lines': ['error', { max: MAX_FILE_LINES, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: TEST_FILES,
    rules: {
      'max-lines-per-function': [
        'error',
        { max: MAX_FUNCTION_LINES, skipBlankLines: false, skipComments: false },
      ],
    },
  },
)
