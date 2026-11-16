#!/usr/bin/env bun
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
/*
 * O app não tem DOM para medir: este script abre cada rota no simulador,
 * tira o print no claro e no escuro (e com a letra no maior tamanho fora dos de
 * acessibilidade) e monta folhas de contato para olhar muitas telas de uma vez.
 *
 *   bun .agents/skills/ui-polish/scripts/app-shoot.ts /explore /voce/perfil \
 *     --metro exp://localhost:8081 --out <pasta> --label antes [--large]
 *
 * Precisa do simulador aberto com o Expo Go e o Metro no ar (AGENTS.md, "Ver a
 * tela no simulador"). A sessão é a que estiver no aparelho.
 */
import { $ } from 'bun'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name: string, fallback = '') => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : (args.splice(i, 2)[1] ?? fallback)
}
const has = (name: string) => {
  const i = args.indexOf(`--${name}`)
  if (i >= 0) args.splice(i, 1)
  return i >= 0
}
const metro = flag('metro', 'exp://localhost:8081')
const out = flag('out', join(process.env.TMPDIR ?? '/tmp', 'ui-polish-app'))
const label = flag('label', 'app')
const themes = flag('themes', 'light,dark').split(',')
const wait = Number(flag('wait', '3500'))
const large = has('large')
/* Só remonta as folhas com os prints que já estão na pasta. */
const sheetsOnly = has('sheets-only')
const udid =
  flag('udid') ||
  (await $`xcrun simctl list devices booted`.text()).match(
    /\(([0-9A-F-]{36})\) \(Booted\)/
  )?.[1]
if (!udid || !args.length) {
  console.error(
    'uso: app-shoot.ts <rota...> [--metro exp://localhost:8081] [--out pasta] [--label nome] [--large]'
  )
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const shots: { route: string; theme: string; file: string }[] = []
const sizes = large ? ['large', 'extra-extra-extra-large'] : ['large']
for (const size of sizes) {
  if (!sheetsOnly) {
    await $`xcrun simctl ui ${udid} content_size ${size}`.quiet()
    /*
     * Reabre o app: tela já montada guarda a medida do texto no tamanho antigo
     * e sai cortada sem estar (quem troca a letra com o app aberto vê o mesmo).
     */
    if (large) {
      await $`xcrun simctl terminate ${udid} host.exp.Exponent`
        .quiet()
        .nothrow()
      await $`xcrun simctl openurl ${udid} ${metro}`.quiet()
      await Bun.sleep(12000)
    }
  }
  for (const theme of themes) {
    if (!sheetsOnly)
      await $`xcrun simctl ui ${udid} appearance ${theme}`.quiet()
    for (const route of args) {
      const sep = route.includes('?') ? '&' : '?'
      const name = `${label}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'inicio'}-${theme}${size === 'large' ? '' : '-grande'}.png`
      if (!sheetsOnly) {
        /* `_r` muda a cada abertura: a tela monta de novo em vez de reaproveitar a anterior. */
        await $`xcrun simctl openurl ${udid} ${`${metro}/--${route}${sep}_r=${Date.now()}`}`.quiet()
        await Bun.sleep(wait)
        await $`xcrun simctl io ${udid} screenshot ${join(out, name)}`.quiet()
      }
      shots.push({
        route,
        theme: size === 'large' ? theme : `${theme} · letra grande`,
        file: name
      })
    }
  }
}
if (!sheetsOnly) {
  if (large)
    await $`xcrun simctl terminate ${udid} host.exp.Exponent`.quiet().nothrow()
  await $`xcrun simctl ui ${udid} content_size large`.quiet()
  await $`xcrun simctl ui ${udid} appearance light`.quiet()
}

/* Folhas de contato: 8 telas por folha, para ler muitas de uma vez. */
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1680, height: 900 },
  deviceScaleFactor: 1.5
})
for (let i = 0; i * 8 < shots.length; i++) {
  const cells = shots
    .slice(i * 8, i * 8 + 8)
    .map(
      (s) =>
        `<figure><img src="file://${join(out, s.file)}"><figcaption>${s.route} · ${s.theme}</figcaption></figure>`
    )
    .join('')
  /* Arquivo, não `setContent`: página em branco não carrega imagem de `file://`. */
  const html = join(out, `${label}-folha-${i + 1}.html`)
  await Bun.write(
    html,
    `<style>body{margin:0;padding:12px;background:#888;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;font:11px ui-monospace,monospace}figure{margin:0;min-width:0}img{width:100%;display:block}figcaption{background:#000;color:#fff;padding:3px 4px;overflow:hidden;white-space:nowrap}</style>${cells}`
  )
  await page.goto(`file://${html}`)
  await page.waitForTimeout(700)
  const file = join(out, `${label}-folha-${i + 1}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}
await browser.close()
console.log(`${shots.length} prints em ${out}`)
