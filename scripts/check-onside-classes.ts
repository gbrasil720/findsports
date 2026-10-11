// Fails when an `onside-*` class used in a `className` attribute has no
// matching CSS selector, or when it shares the attribute with a Tailwind
// utility it silently beats. Runs as part of `bun run check` (see
// package.json).

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_DIRS = ['apps/web/src', 'packages']

// Captures `className="..."`, `className={'...'}` and `className={`...`}`,
// plus object-literal props (`className: "..."` / `className: '...'`), e.g.
// lib/auth-styles.ts and apps/web/src/routes/admin_.billing.tsx.
const CLASS_NAME_PATTERN =
  /className\s*[:=]\s*\{?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g

// An `onside-*` class token, but never part of a `--onside-*` CSS variable.
const TOKEN_PATTERN = /(?<![\w-])onside-[a-z0-9-]+/g

const SELECTOR_PATTERN = /(?<![\w-])\.onside-[a-z0-9-]+/g

const EXCLUDED_FILES = [/routeTree\.gen\.ts$/, /\.(test|spec)\.(ts|tsx)$/]

// The rules in `apps/web/src/styles/onside` sit outside `@layer`, so they beat
// every Tailwind utility for the same property on the same element: the
// utility never applies and the code reads as if it did. This list is small
// and explicit on purpose (it is not derived from the CSS): one line per
// class, with the utilities whose property that class already sets. To change
// one of these, use or add an `onside-*` modifier.
const SIZE = String.raw`text-(?:xs|sm|base|lg|\d?xl|\[\d)`
const COLOR = String.raw`\[(?:var|color|rgb|#)`
const FIELD = new RegExp(`^(?:w-|bg-|${SIZE}|text-${COLOR}|border-${COLOR})`)
const DEAD_UTILITIES: [owner: string, utility: RegExp][] = [
  [
    'onside-btn',
    new RegExp(`^(?:min-h-|p[xytrbl]?-|${SIZE}|disabled:(?:opacity|cursor)-)`)
  ],
  ['onside-kicker', new RegExp(`^(?:m[xytrbl]?-|${SIZE}|text-${COLOR})`)],
  ['onside-label', new RegExp(`^(?:mb-|text-${COLOR})`)],
  ['onside-input', FIELD],
  ['onside-textarea', FIELD],
  ['onside-badge', new RegExp(`^(?:border-${COLOR}|${SIZE}|tracking-)`)],
  ['onside-display', /^(?:leading-|tracking-)/],
  ['onside-heading', /^(?:leading-|tracking-)/]
]

// `md:hover:px-4` -> `px-4`; `disabled:opacity-50` stays whole for the rule
// that names the variant. A variant does not save the utility: it still
// loses to the unlayered rule.
const VARIANTS = /^(?:[a-z0-9-]+(?:\[[^\]]*\])?:)+/

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    // Dependencies are not ours to check, and a workspace package's
    // `node_modules` holds symlinks to directories, which are not files.
    if (entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else if (
      entry.isFile() &&
      !EXCLUDED_FILES.some((pattern) => pattern.test(path))
    ) {
      files.push(path)
    }
  }
  return files
}

function usagesFrom(source: string): string[] {
  const names: string[] = []
  for (const match of source.matchAll(CLASS_NAME_PATTERN)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    for (const token of value.matchAll(TOKEN_PATTERN)) names.push(token[0])
  }
  return names
}

function deadUtilitiesFrom(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(CLASS_NAME_PATTERN)) {
    const tokens = (match[1] ?? match[2] ?? match[3] ?? '')
      .split(/[\s'"`{}?,$]+/)
      .filter(Boolean)
    for (const [owner, utility] of DEAD_UTILITIES) {
      if (!tokens.includes(owner)) continue
      for (const token of tokens) {
        const bare = token.replace(/^-/, '')
        if (utility.test(bare) || utility.test(bare.replace(VARIANTS, '')))
          found.push(`${owner} + ${token}`)
      }
    }
  }
  return found
}

function selectorsFrom(css: string): string[] {
  const names: string[] = []
  for (const match of css.matchAll(SELECTOR_PATTERN)) {
    names.push(match[0].slice(1))
  }
  return names
}

async function main(): Promise<void> {
  const files: string[] = []
  for (const dir of SCAN_DIRS) {
    files.push(...(await walk(join(ROOT, dir))))
  }

  const declared = new Set<string>()
  const usedByFile = new Map<string, Set<string>>()
  const dead: string[] = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    if (file.endsWith('.css')) {
      for (const name of selectorsFrom(content)) declared.add(name)
    } else {
      const names = usagesFrom(content)
      if (names.length > 0) usedByFile.set(file, new Set(names))
      for (const pair of deadUtilitiesFrom(content))
        dead.push(`  ${pair} at: ${relative(ROOT, file)}`)
    }
  }

  if (dead.length > 0) {
    console.error(
      '[onside-classes] utilities that lose to the onside-* class on the same element (use an onside-* modifier):'
    )
    for (const line of dead) console.error(line)
    process.exit(1)
  }

  const undeclared = new Map<string, string[]>()
  for (const [file, names] of usedByFile) {
    for (const name of names) {
      if (!declared.has(name)) {
        undeclared.set(name, [...(undeclared.get(name) ?? []), file])
      }
    }
  }

  if (undeclared.size > 0) {
    console.error(
      '[onside-classes] classes in className without a CSS selector:'
    )
    for (const [name, filesList] of [...undeclared.entries()].sort()) {
      console.error(
        `  ${name} used at: ${filesList
          .map((file) => relative(ROOT, file))
          .join(', ')}`
      )
    }
    process.exit(1)
  }

  console.log(
    `[onside-classes] ok: every onside-* class in className has a selector (${usedByFile.size} files scanned)`
  )
}

await main()
