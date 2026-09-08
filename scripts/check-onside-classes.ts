// Fails when an `onside-*` class used in a `className` attribute has no
// matching CSS selector. Runs as part of `bun run check` (see package.json).

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_DIRS = ['apps/web/src', 'packages']

// Captures `className="..."`, `className={'...'}` and `className={`...`}`,
// plus object-literal props (`className: "..."` / `className: '...'`), e.g.
// lib/auth-styles.ts and apps/web/src/routes/admin_.billing.tsx.
const CLASS_NAME_PATTERN =
  /className\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g

// An `onside-*` class token, but never part of a `--onside-*` CSS variable.
const TOKEN_PATTERN = /(?<![\w-])onside-[a-z0-9-]+/g

const SELECTOR_PATTERN = /(?<![\w-])\.onside-[a-z0-9-]+/g

const EXCLUDED_FILES = [/routeTree\.gen\.ts$/, /\.(test|spec)\.(ts|tsx)$/]

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else if (!EXCLUDED_FILES.some((pattern) => pattern.test(path))) {
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

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    if (file.endsWith('.css')) {
      for (const name of selectorsFrom(content)) declared.add(name)
    } else {
      const names = usagesFrom(content)
      if (names.length > 0) usedByFile.set(file, new Set(names))
    }
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
