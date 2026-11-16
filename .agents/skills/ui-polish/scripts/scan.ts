#!/usr/bin/env bun
/*
 * Varredura do código: o que dá para achar sem abrir a tela. Segundos.
 *
 *   bun .agents/skills/ui-polish/scripts/scan.ts            # web e app inteiros
 *   bun .agents/skills/ui-polish/scripts/scan.ts apps/web/src/components/painel
 *   bun .agents/skills/ui-polish/scripts/scan.ts --changed  # só o que o branch mexeu
 *
 * Cada regra aponta arquivo:linha. É triagem: leia a linha antes de mexer.
 */
import { $, Glob } from 'bun'

const root = (await $`git rev-parse --show-toplevel`.text()).trim()
const args = process.argv.slice(2)
const changed = args.includes('--changed')
const targets = args.filter((a) => !a.startsWith('--'))
const scope = targets.length
  ? targets
  : [
      'apps/web/src',
      'apps/mobile/app',
      'apps/mobile/components',
      'packages/ui/src'
    ]

let files: string[] = []
if (changed) {
  const base = (
    await $`git merge-base HEAD origin/master`.cwd(root).text()
  ).trim()
  const diff = await $`git diff --name-only ${base}`.cwd(root).text()
  const fresh = await $`git ls-files --others --exclude-standard`
    .cwd(root)
    .text()
  files = `${diff}\n${fresh}`
    .split('\n')
    .filter((f) => scope.some((s) => f.startsWith(s)))
} else {
  for (const dir of scope)
    for await (const f of new Glob(
      `${dir.replace(/\/$/, '')}/**/*.{css,tsx,ts}`
    ).scan({ cwd: root }))
      files.push(f)
}
files = files.filter(
  (f) =>
    /\.(css|tsx|ts)$/.test(f) && !/\.(test|gen)\.|\/dev\/|node_modules/.test(f)
)

/*
 * A paleta: as cores do DESIGN.md, as variáveis `--nome: #cor` de qualquer CSS
 * e a tabela do app (`theme.tsx`). Cor escrita direto numa propriedade, fora
 * disso, é deriva ou token que falta.
 */
const hex6 = (h: string) =>
  (h.length === 4
    ? `#${[...h.slice(1)].map((c) => c + c).join('')}`
    : h
  ).toLowerCase()
const design = await Bun.file(`${root}/DESIGN.md`).text()
const palette = new Set([
  '#000000',
  '#ffffff',
  ...(design.split('typography:')[0].match(/#[0-9a-f]{6}/g) ?? [])
])
for await (const f of new Glob('{apps/web/src,packages/ui/src}/**/*.css').scan({
  cwd: root
}))
  for (const m of (await Bun.file(`${root}/${f}`).text()).matchAll(
    /^\s*--[\w-]+:\s*(#[0-9a-fA-F]{3,6})\s*;/gm
  ))
    palette.add(hex6(m[1]))
for (const h of (
  await Bun.file(`${root}/apps/mobile/components/theme.tsx`).text()
).match(/#[0-9a-fA-F]{6}\b/g) ?? [])
  palette.add(hex6(h))

type Hit = { file: string; line: number; text: string }
const found = new Map<string, Hit[]>()
const hit = (rule: string, file: string, line: number, text: string) => {
  const list = found.get(rule) ?? []
  list.push({ file, line, text: text.trim().slice(0, 110) })
  found.set(rule, list)
}

const WEB: [string, RegExp][] = [
  [
    'transition: all (anime só o que muda)',
    /transition(-property)?:\s*all\b|\btransition-all\b/
  ],
  [
    'anima layout (width, height, top, left, margin, padding): use transform',
    /transition:[^;]*\b(width|height|top|left|right|bottom|margin|padding)\b/
  ],
  ['ease-in em interface (começa lento, parece travado)', /\bease-in\b(?!-)/],
  ['nasce de scale(0): comece em 0.9 ou mais, com opacidade', /scale\(0\)/],
  [
    'transição de 400 ms ou mais em interface',
    /transition:[^;]*(?<![\d.])(0?\.[4-9]\d*s|[1-9](\.\d+)?s|[4-9]\d\dms)\b/
  ],
  [
    '100vh (no celular a barra do navegador corta): 100dvh ou 100svh',
    /\b100vh\b/
  ],
  ['letra abaixo de 11 px', /font-size:\s*(\d|10)(\.\d+)?px/],
  ['z-index solto acima de 100', /z-index:\s*\d{3,}/]
]
const APP: [string, RegExp][] = [
  [
    "Text/TextInput do react-native (use os de '@/components/ui')",
    /import \{[^}]*\b(Text|TextInput)\b[^}]*\} from 'react-native'/
  ],
  [
    '<StatusBar> ou statusBarStyle (use useStatusBar)',
    /<StatusBar\b|statusBarStyle/
  ],
  [
    'entering/exiting montado no JSX (o Reanimated recomeça a entrada): constante de módulo',
    /\b(entering|exiting)=\{[A-Z]\w+\.\w+\(/
  ],
  ['Easing.in em interface', /Easing\.in\(/],
  [
    'Animated do react-native (use Reanimated)',
    /import \{[^}]*\bAnimated\b[^}]*\} from 'react-native'/
  ]
]
const COPY: [string, RegExp][] = [
  [
    '"reserva" em texto de tela (é presença)',
    />[^<{]*\breserv(a|ar|as|ado|e)\b[^<{]*</i
  ],
  ['"trial" em texto de tela (é "teste")', />[^<{]*\btrial\b[^<{]*</i],
  [
    'travessão ou ponto e vírgula em texto de tela',
    />[^<{]*[a-zà-ú](\s—\s|;\s)[^<{]*</i
  ]
]

/* Movimento de verdade: quadros-chave ou transição de posição. Troca de cor não conta. */
const motion =
  /@keyframes|transition:[^;]*\b(transform|translate|scale|rotate)\b/
for (const file of files) {
  const src = await Bun.file(`${root}/${file}`)
    .text()
    .catch(() => '')
  if (!src) continue
  const lines = src.split('\n')
  const css = file.endsWith('.css')
  const app = file.startsWith('apps/mobile')
  const tokens =
    /theme\.tsx$|tokens\.css$|map-style|medals?\.|\/ai\/theme/.test(file)

  if (
    css &&
    motion.test(src) &&
    !/prefers-reduced-motion|polish-ok: movimento reduzido/.test(src)
  )
    hit(
      'CSS com movimento e sem prefers-reduced-motion',
      file,
      1,
      `${src.match(new RegExp(motion, 'g'))?.length} animações`
    )
  if (css) {
    const none = src.match(/outline:\s*(none|0)\b/g)?.length ?? 0
    const ring = src.match(/:focus-visible/g)?.length ?? 0
    if (none > ring)
      hit(
        'outline: none em mais regras do que :focus-visible',
        file,
        1,
        `${none} sem contorno, ${ring} com foco`
      )
  }

  lines.forEach((text, i) => {
    if (/polish-ok/.test(text) || /^\s*(\/\/|\*|\/\*)/.test(text)) return
    const rules = css ? WEB : app ? APP : []
    for (const [rule, re] of rules)
      if (re.test(text)) hit(rule, file, i + 1, text)
    if (file.endsWith('.tsx'))
      for (const [rule, re] of COPY)
        if (re.test(text)) hit(rule, file, i + 1, text)
    if (tokens || /^\s*--[\w-]+:/.test(text)) return
    for (const h of text.match(
      /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g
    ) ?? [])
      if (!palette.has(hex6(h)) && (css || /['"`]#/.test(text)))
        hit(
          `cor fora da paleta do DESIGN.md`,
          file,
          i + 1,
          `${hex6(h)}  ${text}`
        )
  })
}

const total = [...found.values()].reduce((n, list) => n + list.length, 0)
console.log(`${files.length} arquivos, ${total} achados\n`)
for (const [rule, list] of [...found].sort(
  (a, b) => b[1].length - a[1].length
)) {
  console.log(`${rule}  (${list.length})`)
  if (rule.startsWith('cor fora')) {
    const by = new Map<string, Hit[]>()
    for (const h of list)
      by.set(h.text.slice(0, 7), [...(by.get(h.text.slice(0, 7)) ?? []), h])
    for (const [color, hits] of [...by]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 25))
      console.log(`  ${color} ×${hits.length}  ${hits[0].file}:${hits[0].line}`)
  } else {
    for (const h of list.slice(0, 12))
      console.log(`  ${h.file}:${h.line}  ${h.text}`)
    if (list.length > 12) console.log(`  … mais ${list.length - 12}`)
  }
  console.log()
}
