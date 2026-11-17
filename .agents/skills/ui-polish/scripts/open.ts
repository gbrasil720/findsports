#!/usr/bin/env bun
/*
 * Estados abertos: clica no que abre menu, folha ou janela (aria-haspopup,
 * aria-expanded, <summary> e rótulos como "Novo jogo", "Entrar", "Filtros"),
 * tira o print e mede só o que apareceu com a peça aberta.
 *
 *   BASE=http://localhost:3001 bun .agents/skills/ui-polish/scripts/open.ts \
 *     <pasta> <cookie de sessão "nome=valor" ou -> /admin /admin/jogos
 *
 * `coberto` e `sem-foco` ficam de fora: atrás de uma janela tudo está coberto,
 * e depois de um clique o foco do script não conta como foco de teclado.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const [out, cookie, ...paths] = process.argv.slice(2)
const base = process.env.BASE ?? 'http://localhost:3001'
const measure = await Bun.file(join(import.meta.dir, 'measure.js')).text()
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const NAMED =
  /^(novo jogo|filtros?|vou assistir aqui|entrar|menu|mais|compartilhar|editar|excluir conta|trocar|assinar|escolher|como ler)/i

for (const width of [1280, 390]) {
  const phone = width <= 480
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width, height: phone ? 844 : 800 },
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone
  })
  if (cookie !== '-') {
    const [name, ...value] = cookie.split('=')
    await context.addCookies([{ name, value: value.join('='), url: base }])
  }
  const page = await context.newPage()
  for (const path of paths) {
    const open = async () => {
      await page.goto(path, { waitUntil: 'load' })
      await page
        .waitForLoadState('networkidle', { timeout: 4000 })
        .catch(() => {})
      await page.waitForTimeout(600)
    }
    await open()
    const landed = new URL(page.url()).pathname
    const id = (f: { rule: string; where: string; msg: string }) =>
      `${f.rule}|${f.where}|${f.msg}`
    const before = new Set((await page.evaluate(measure)).findings.map(id))
    const triggers = await page.evaluate(
      (named) => {
        const re = new RegExp(named.source, named.flags)
        const seen = new Set<string>()
        const all = [
          ...document.querySelectorAll<HTMLElement>(
            'button, summary, [role=button]'
          )
        ]
        return all
          .filter((el) => {
            const r = el.getBoundingClientRect()
            if (!r.width || r.top > innerHeight * 3) return false
            const label = (
              el.getAttribute('aria-label') ||
              el.innerText ||
              ''
            ).trim()
            const opens =
              el.hasAttribute('aria-haspopup') ||
              el.hasAttribute('aria-expanded') ||
              el.tagName === 'SUMMARY' ||
              re.test(label)
            if (!opens || seen.has(label)) return false
            seen.add(label)
            return true
          })
          .slice(0, 8)
          .map((el) => ({
            /* Posição na lista: rótulo vazio, cortado ou repetido acha a peça errada. */
            index: all.indexOf(el),
            label: (el.getAttribute('aria-label') || el.innerText || '')
              .trim()
              .slice(0, 40)
          }))
      },
      { source: NAMED.source, flags: NAMED.flags }
    )
    console.log(
      `\n${path}  ${width}  abre: ${triggers.map((t) => t.label).join(' | ') || 'nada'}`
    )
    for (const [i, { index, label }] of triggers.entries()) {
      await open()
      const el = page.locator('button, summary, [role=button]').nth(index)
      try {
        await el.click({ timeout: 3000 })
      } catch {
        console.log(`  (não clicou) ${label}`)
        continue
      }
      await page.waitForTimeout(700)
      if (new URL(page.url()).pathname !== landed) {
        console.log(`  (navegou) ${label}`)
        continue
      }
      const name = `${path.replace(/[^a-z0-9]+/gi, '-')}-${width}-${i}`
      await page.screenshot({ path: join(out, `${name}.png`) })
      const fresh = (await page.evaluate(measure)).findings.filter(
        (f: { rule: string; where: string; msg: string }) =>
          !before.has(id(f)) && f.rule !== 'coberto' && f.rule !== 'sem-foco'
      )
      console.log(`  «${label}»  ${fresh.length} novos  ${name}.png`)
      for (const f of fresh)
        console.log(
          `    ${f.sev === 'erro' ? 'ERRO ' : 'aviso'} ${f.rule}  ${f.where}  ${f.msg}${f.text ? `  «${f.text}»` : ''}`
        )
    }
  }
  await context.close()
}
await browser.close()
