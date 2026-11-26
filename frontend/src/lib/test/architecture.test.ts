// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  LABEL_EMOJI_MAX_LENGTH,
  LABEL_NAME_MAX_LENGTH,
  THEME_STORAGE_KEY,
  TITLE_MAX_LENGTH,
} from '../constants'
import { LABEL_PALETTE } from '../palette'
import {
  backticked,
  configs,
  docHits,
  expectNone,
  foldersUnder,
  lineHits,
  production,
  proseLines,
  readRepo,
  repoPathExists,
  resolveImport,
  sources,
} from './guards/repo'

const SHARED_FILE = /^src\/lib\/(components|components\/icons|controllers)\/[^/]+$/
const FEATURE_DIR = /^src\/(views|overlays)\/[^/]+\//
const APP = 'src/App.svelte'
const PALETTE = 'src/lib/palette.ts'
const VIEWPORT = 'src/lib/viewport.svelte.ts'
const MAX_COMMENT_LINES = 2
const HISTORY_WORDS = ['previously', 'formerly', 'no longer', 'used to', 'was renamed']
const DIRECTIVES = ['eslint-disable', '@ts-ignore', '@ts-expect-error', 'svelte-ignore']
const COMMENT_MARKERS = /^\s*(\/\/+|\/\*+|<!--)|(\*\/|-->)\s*$/g
const DIVIDER = /^(-{3,}|={3,}|\*{3,}|#{3,})/
const TOKEN_RULES: [RegExp, string][] = [
  [/(?<![&\w])#[0-9a-fA-F]{3,8}\b/, 'hex colour'],
  [/\b(?:rgba?|hsla?)\(/, 'colour function'],
  [/(?<![\w-])dark:[\w[!-]/, 'dark: variant'],
  [/\btext-\[[^\]]*px\]/, 'pixel font size'],
]
const SHADOW_CLASS = /(?<![\w-])shadow-([\w-]+)/g
const UTC_DATE = /\.toISOString\(|\bDate\.UTC\(|\.getUTC\w*\(|\bDate\.parse\(/
const MEDIA_QUERY = /\b(?:matchMedia|MediaQuery)\s*\(/
const WIDTH_COMPARE = /\binnerWidth\s*[<>]|[<>]=?\s*(?:window\.)?innerWidth\b/
const TESTED_MODULE = /^src\/lib\/(tasks|recurrence|dnd)\/.+\.ts$|\.svelte\.ts$/
const DOM_ONLY = /\.action\.(svelte\.)?ts$/
const FRONTEND_DOC = '.claude/ARCHITECTURE-FRONTEND.md'
const AGENT_DOCS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/ARCHITECTURE.md',
  '.claude/ARCHITECTURE-BACKEND.md',
  FRONTEND_DOC,
  '.claude/DATA-MODEL.md',
]
// About 20% above the delivered docs; raising a cap needs the owner's approval.
const DOC_CAPS: [string, number][] = [
  ['AGENTS.md', 27_500],
  [FRONTEND_DOC, 24_100],
]
const MAX_PROSE_CHARS = 240
const REPO_PATH = /^(frontend|\.claude|\.github|\.codex|\.jscpd|scripts)\//
const PLACEHOLDER = /[<*{…]/
const DOCUMENTED_FILE = /^src\/(lib\/((controllers|components|tasks|recurrence|dnd)\/)?)?[^/]+$/
const COMPOSER_DIR = 'src/lib/components/composer/'
const FOLDER_PARENTS = ['src/views/', 'src/overlays/', 'src/lib/', 'src/lib/components/']

const feature = (file: string) => FEATURE_DIR.exec(file)?.[0]

const importers = new Map<string, Set<string>>()
for (const source of production) {
  for (const specifier of source.specifiers) {
    const target = resolveImport(source.file, specifier)
    if (target && target !== source.file) {
      importers.set(target, (importers.get(target) ?? new Set()).add(source.file))
    }
  }
}
const importersOf = (file: string) => [...(importers.get(file) ?? [])]

function shadowTokens(): string[] {
  const config = readRepo('frontend/tailwind.config.js')
  const block = /boxShadow:\s*\{([\s\S]*?)\n\s*\}/.exec(config)?.[1] ?? ''
  return [...block.matchAll(/^\s*([\w-]+):/gm)].flatMap(([, key]) => (key ? [key] : []))
}

function commentProblems(): string[] {
  return [...sources, ...configs].flatMap((source) => {
    let run = 0
    const runs = source.lines.flatMap((line, i) => {
      run = line.comment.trim() && !line.code.trim() ? run + 1 : 0
      return run === MAX_COMMENT_LINES + 1 ? [`${source.file}:${i + 1} comment run`] : []
    })
    return source.comments
      .flatMap((comment) => {
        const at = `${source.file}:${comment.line}`
        const text = comment.text.replace(COMMENT_MARKERS, '').trim().toLowerCase()
        const tall = comment.block && comment.endLine - comment.line >= MAX_COMMENT_LINES
        return [
          ...(tall ? [`${at} block comment`] : []),
          ...(DIVIDER.test(text) ? [`${at} section divider`] : []),
          ...HISTORY_WORDS.filter((word) => text.includes(word)).map((w) => `${at} "${w}"`),
          ...DIRECTIVES.filter((directive) => text.includes(directive)).map((d) => `${at} ${d}`),
        ]
      })
      .concat(runs)
  })
}

function hexFromChannels(channels: string[]): string {
  return `#${channels.map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

describe('architecture guards', () => {
  it('keeps lib/components and lib/controllers shared, and feature folders private', () => {
    const shared = production
      .filter(({ file }) => SHARED_FILE.test(file))
      .flatMap(({ file }) => {
        const users = importersOf(file)
        const folders = new Set(users.map(feature))
        const [only] = folders
        if (users.length < 2) return [`${file}: ${users.length} importer(s)`]
        return folders.size === 1 && only ? [`${file}: only ${only} uses it`] : []
      })
    const leaks = production
      .filter(({ file }) => feature(file))
      .flatMap(({ file }) =>
        importersOf(file)
          .filter((user) => user !== APP && feature(user) !== feature(file))
          .map((user) => `${file}: imported by ${user}`),
      )
    const appTargets = (sources.find(({ file }) => file === APP)?.specifiers ?? []).flatMap(
      (specifier) => feature(resolveImport(APP, specifier) ?? '') ?? [],
    )
    const entries = appTargets
      .filter((folder, i) => appTargets.indexOf(folder) !== i)
      .map((folder) => `${APP}: imports more than the entry of ${folder}`)
    expectNone(
      [...shared, ...leaks, ...entries],
      'lib/components and lib/controllers hold code with ≥2 importers from different folders; move single-folder code into that views/ or overlays/ folder. A feature folder is private: App.svelte imports only its entry component.',
    )
  })

  it('styles only with design tokens', () => {
    const tokens = shadowTokens()
    const files = production.filter(({ file }) => file !== PALETTE)
    const found = [
      ...TOKEN_RULES.flatMap(([rule, name]) =>
        lineHits(files, ({ code }) => rule.test(code), ` ${name}`),
      ),
      ...lineHits(
        files,
        ({ code }) =>
          [...code.matchAll(SHADOW_CLASS)].some(([, name]) => !tokens.includes(name ?? '')),
        ' off-scale shadow',
      ),
    ]
    expectNone(
      found,
      `Use the Tailwind theme tokens: no hex or rgb()/hsl() (label colours come from ${PALETTE}), no dark: variants (tokens re-point per theme), no text-[Npx], shadows only ${tokens.map((t) => `shadow-${t}`).join(', ')}:`,
    )
  })

  it('keeps dates as local calendar dates', () => {
    expectNone(
      lineHits(production, ({ code }) => UTC_DATE.test(code)),
      'Dates are local: use lib/date.ts (toISODate, fromISODate, currentDateKey), never a UTC conversion:',
    )
  })

  it('keeps comments short, current and free of lint suppressions', () => {
    expectNone(
      commentProblems(),
      `Comments: at most ${MAX_COMMENT_LINES} lines of non-obvious why, no dividers, no change history, and fix the code instead of suppressing a check:`,
    )
  })

  it('keeps isCompact() the only JS breakpoint', () => {
    const files = production.filter(({ file }) => file !== VIEWPORT)
    expectNone(
      lineHits(files, ({ code }) => MEDIA_QUERY.test(code) || WIDTH_COMPARE.test(code)),
      `Read layout from isCompact() (and other media queries) in ${VIEWPORT}; use prefersReducedMotion from svelte/motion:`,
    )
  })

  it('keeps a test beside every helper and rune module', () => {
    const files = new Set(sources.map(({ file }) => file))
    const missing = production
      .map(({ file }) => file)
      .filter((file) => TESTED_MODULE.test(file) && !DOM_ONLY.test(file))
      .filter((file) => !files.has(file.replace(/\.ts$/, '.test.ts')))
    expectNone(
      missing,
      'Add a sibling *.test.ts; a module that needs a real DOM is named *.action.ts / *.action.svelte.ts:',
    )
  })

  it('mirrors the constants shared with the backend and index.html', () => {
    const labelRs = readRepo('backend/src/domain/label.rs')
    const configRs = readRepo('backend/src/config.rs')
    const html = readRepo('frontend/index.html')
    const css = readRepo('frontend/src/app.css')
    const rustCap = (name: string) =>
      Number(new RegExp(`const ${name}: usize = (\\d+);`).exec(configRs)?.[1])
    const rustPalette = /LABEL_PALETTE[^=]*=\s*\[([^\]]*)\]/.exec(labelRs)?.[1] ?? ''
    const fog = [...css.matchAll(/--fog:\s*(\d+)\s+(\d+)\s+(\d+);/g)].map((m) =>
      hexFromChannels(m.slice(1)),
    )
    const metaTags = [...html.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)].map(([tag]) => tag)
    const metas = metaTags.map((tag) => [
      /prefers-color-scheme: (\w+)/.exec(tag)?.[1],
      /content="([^"]+)"/.exec(tag)?.[1]?.toUpperCase(),
    ])
    expect(
      {
        palette: LABEL_PALETTE.map(({ hex }) => hex),
        caps: [TITLE_MAX_LENGTH, LABEL_NAME_MAX_LENGTH, LABEL_EMOJI_MAX_LENGTH],
        themeKey: THEME_STORAGE_KEY,
        themeScheme: metas.map(([scheme]) => scheme),
        themeColor: [
          ['light', fog[0]],
          ...[...new Set(fog.slice(1))].map((dark) => ['dark', dark]),
        ],
      },
      'Mirrored constants drifted: palette ↔ backend/src/domain/label.rs, caps ↔ backend/src/config.rs, theme key and theme-color ↔ frontend/index.html and the --fog tokens in src/app.css.',
    ).toEqual({
      palette: [...rustPalette.matchAll(/"([^"]+)"/g)].map(([, hex]) => hex),
      caps: ['MAX_TITLE_LEN', 'MAX_LABEL_NAME_LEN', 'MAX_LABEL_EMOJI_LEN'].map(rustCap),
      themeKey: /localStorage\.getItem\('([^']+)'\)/.exec(html)?.[1],
      themeScheme: metaTags.map((tag) => /data-scheme="(\w+)"/.exec(tag)?.[1]),
      themeColor: metas,
    })
  })
  it('names every shared file and folder in ARCHITECTURE-FRONTEND.md', () => {
    const tokens = proseLines(readRepo(FRONTEND_DOC)).flatMap(({ line }) =>
      backticked(line).map((token) => token.replace(/\/$/, '')),
    )
    const named = (name: string) => tokens.some((t) => t === name || t.endsWith(`/${name}`))
    const composerEntry = (file: string) =>
      file.startsWith(COMPOSER_DIR) && importersOf(file).some((u) => !u.startsWith(COMPOSER_DIR))
    const files = production
      .map(({ file }) => file)
      .filter((file) => DOCUMENTED_FILE.test(file) || composerEntry(file))
      .filter((file) => {
        const base = file.slice(file.lastIndexOf('/') + 1)
        return !named(base) && !named(base.replace(/\.svelte$/, ''))
      })
    const folders = foldersUnder(FOLDER_PARENTS).filter(
      (dir) => !named(dir.split('/').slice(-2).join('/')),
    )
    expectNone(
      [...files, ...folders],
      `Name each in ${FRONTEND_DOC} in backticks (one line: where it lives, what it is for):`,
    )
  })

  it('keeps every repo path named in the agent docs real', () => {
    const missing = docHits(AGENT_DOCS, (line) =>
      backticked(line)
        .filter((token) => REPO_PATH.test(token) && !PLACEHOLDER.test(token))
        .map((token) => (token.split(/\s/)[0] ?? token).replace(/:\d+$/, ''))
        .filter((path) => !repoPathExists(path)),
    )
    expectNone(missing, 'A repo path in the agent docs does not exist; correct or remove it:')
  })

  it('keeps AGENTS.md and ARCHITECTURE-FRONTEND.md free of history', () => {
    const found = docHits(
      DOC_CAPS.map(([doc]) => doc),
      (line) => HISTORY_WORDS.filter((word) => line.toLowerCase().includes(word)),
    )
    expectNone(found, 'Docs describe the current state only; git holds the history:')
  })

  it('keeps AGENTS.md and ARCHITECTURE-FRONTEND.md within their size', () => {
    const oversized = DOC_CAPS.flatMap(([doc, cap]) => {
      const bytes = new TextEncoder().encode(readRepo(doc)).length
      return bytes > cap ? [`${doc}: ${bytes} bytes (cap ${cap})`] : []
    })
    const long = docHits(
      DOC_CAPS.map(([doc]) => doc),
      (line) => {
        const chars = [...line].length
        return !line.startsWith('|') && chars > MAX_PROSE_CHARS ? [`prose line of ${chars}`] : []
      },
    )
    expectNone(
      [...oversized, ...long],
      `Trim first (how-it-works, duplicates, history); a cap rises only with the owner's approval. Prose lines stay within ${MAX_PROSE_CHARS} characters:`,
    )
  })
})
