import ts from 'typescript'
import { expect } from 'vitest'

type Line = { code: string; comment: string }
type Comment = { line: number; endLine: number; text: string; block: boolean }
type Source = {
  file: string
  test: boolean
  lines: Line[]
  comments: Comment[]
  specifiers: string[]
}
type Range = { start: number; end: number }

const REPO_ROOT = decodeURIComponent(new URL('../../../../../', import.meta.url).pathname)
const SVELTE_BLOCK = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g
const HTML_COMMENT = /<!--[\s\S]*?-->/g
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g

export function readRepo(path: string): string {
  const text = ts.sys.readFile(`${REPO_ROOT}${path}`)
  if (text === undefined) throw new Error(`Cannot read ${path} from the repo root`)
  return text
}

export function repoPathExists(path: string): boolean {
  return ts.sys.fileExists(`${REPO_ROOT}${path}`) || ts.sys.directoryExists(`${REPO_ROOT}${path}`)
}

export function proseLines(text: string): { number: number; line: string }[] {
  let fenced = false
  return text.split('\n').flatMap((line, i) => {
    if (line.trimStart().startsWith('```')) fenced = !fenced
    else if (!fenced) return [{ number: i + 1, line }]
    return []
  })
}

export function backticked(line: string): string[] {
  return line.split('`').filter((_, i) => i % 2 === 1)
}

function moduleSpecifier(node: ts.Node): ts.StringLiteral | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier
      : undefined
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [arg] = node.arguments
    return arg && ts.isStringLiteral(arg) ? arg : undefined
  }
  return undefined
}

function scanScript(code: string, offset: number, imports: string[]) {
  const file = ts.createSourceFile('script.ts', code, ts.ScriptTarget.Latest, true)
  const comments = new Map<number, number>()
  const visit = (node: ts.Node): void => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(code, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(code, node.getEnd()) ?? []),
    ]
    for (const range of ranges) comments.set(range.pos + offset, range.end + offset)
    const specifier = moduleSpecifier(node)
    if (specifier) imports.push(specifier.text)
    node.getChildren(file).forEach(visit)
  }
  visit(file)
  return [...comments].map(([start, end]) => ({ start, end }))
}

function rangesOf(pattern: RegExp, text: string, offset: number, outside: Range[] = []): Range[] {
  return [...text.matchAll(pattern)]
    .map((match) => ({ start: match.index + offset, end: match.index + offset + match[0].length }))
    .filter((range) => !outside.some((r) => r.start <= range.start && range.end <= r.end))
}

function commentRanges(file: string, text: string, imports: string[]) {
  if (!file.endsWith('.svelte')) return scanScript(text, 0, imports)
  const blocks = [...text.matchAll(SVELTE_BLOCK)].map((match) => {
    const [whole, tag = '', body = ''] = match
    const start = match.index + whole.indexOf('>') + 1
    return { tag, body, start, range: { start: match.index, end: match.index + whole.length } }
  })
  return [
    ...blocks.flatMap(({ tag, body, start }) =>
      tag === 'script' ? scanScript(body, start, imports) : rangesOf(CSS_COMMENT, body, start),
    ),
    ...rangesOf(
      HTML_COMMENT,
      text,
      0,
      blocks.map((b) => b.range),
    ),
  ]
}

function lineOf(text: string, at: number): number {
  return text.slice(0, at).split('\n').length
}

function load(file: string): Source {
  const text = readRepo(`frontend/${file}`)
  const imports: string[] = []
  const ranges = commentRanges(file, text, imports)
  const inComment = new Uint8Array(text.length)
  for (const { start, end } of ranges) inComment.fill(1, start, end)
  const lines: Line[] = [{ code: '', comment: '' }]
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i)
    const line = lines.at(-1) ?? { code: '', comment: '' }
    if (char === '\n') lines.push({ code: '', comment: '' })
    else if (inComment[i]) line.comment += char
    else line.code += char
  }
  return {
    file,
    test: file.endsWith('.test.ts') || file.startsWith('src/lib/test/'),
    lines,
    comments: ranges.map(({ start, end }) => ({
      line: lineOf(text, start),
      endLine: lineOf(text, end - 1),
      text: text.slice(start, end),
      block: !text.startsWith('//', start),
    })),
    specifiers: imports,
  }
}

function frontendFiles(dir: string, extensions: string[], depth?: number): Source[] {
  return ts.sys
    .readDirectory(`${REPO_ROOT}frontend/${dir}`, extensions, ['**/node_modules/**'], [], depth)
    .map((path) => path.slice(`${REPO_ROOT}frontend/`.length))
    .sort()
    .map(load)
}

export const sources = frontendFiles('src', ['.ts', '.svelte'])
export const configs = frontendFiles('', ['.js', '.ts'], 1)

export const production = sources.filter((source) => !source.test)

const files = new Set(sources.map((source) => source.file))

export function foldersUnder(parents: string[]): string[] {
  const dirs = sources.flatMap(({ file }) =>
    parents.flatMap((parent) => {
      const [name, ...rest] = file.startsWith(parent) ? file.slice(parent.length).split('/') : []
      return name && rest.length > 0 ? [`${parent}${name}`] : []
    }),
  )
  return [...new Set(dirs)]
}

export function docHits(docs: string[], hits: (line: string) => string[]): string[] {
  return docs.flatMap((doc) =>
    proseLines(readRepo(doc)).flatMap(({ number, line }) =>
      hits(line).map((hit) => `${doc}:${number} ${hit}`),
    ),
  )
}

export function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = new URL(specifier, `file:///${from}`).pathname.slice(1)
  return [base, `${base}.ts`, `${base}/index.ts`].find((file) => files.has(file))
}

export function lineHits(
  files: Source[],
  hit: (line: Line, source: Source) => boolean,
  label = '',
): string[] {
  return files.flatMap((source) =>
    source.lines.flatMap((line, i) =>
      hit(line, source) ? [`${source.file}:${i + 1}${label}`] : [],
    ),
  )
}

export function expectNone(found: string[], fix: string): void {
  const sorted = found.toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  expect(sorted, `${fix}\n  ${sorted.join('\n  ')}`).toEqual([])
}
