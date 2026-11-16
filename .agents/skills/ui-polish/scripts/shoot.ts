#!/usr/bin/env bun
/*
 * Abre cada tela em 1280 e 390, claro e escuro, tira o print da página inteira
 * e roda `measure.js`. Uma passada a mais com movimento reduzido lista o que
 * ainda se mexe.
 *
 *   bun .agents/skills/ui-polish/scripts/shoot.ts /dashboard /admin \
 *     --base http://localhost:3001 --login email:senha --out <pasta> --label antes
 *
 * `--login` entra pela API (sobe o web com o par de teste do Turnstile, ver
 * AGENTS.md). `--cookie "a=b; c=d"` usa uma sessão pronta. `--widths` e
 * `--themes` trocam as medidas. `--only regra1,regra2` filtra o relatório.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'

const args = process.argv.slice(2)
const flag = (name: string, fallback = '') => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : (args.splice(i, 2)[1] ?? fallback)
}
const base = flag('base', 'http://localhost:3001')
const out = flag('out', join(process.env.TMPDIR ?? '/tmp', 'ui-polish'))
const label = flag('label', 'shot')
const login = flag('login')
const cookie = flag('cookie')
const only = flag('only').split(',').filter(Boolean)
const widths = flag('widths', '1280,390').split(',').map(Number)
const themes = flag('themes', 'light,dark').split(',')
const paths = args
if (!paths.length) {
  console.error(
    'uso: shoot.ts <caminho...> [--base url] [--login email:senha] [--out pasta] [--label nome]'
  )
  process.exit(1)
}

/* `networkidle` não chega no `vite dev` (HMR, tiles do mapa): espera curta e segue. */
const open = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}

const measure = await Bun.file(join(import.meta.dir, 'measure.js')).text()
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const report: unknown[] = []
let errors = 0
const seen = new Set<string>()

/* Entra uma vez só: o login tem limite de tentativas (3 em 10 s). */
const session: { name: string; value: string; url: string }[] = []
if (login) {
  const [email, ...password] = login.split(':')
  /* `fetch`, não `context.request`: no Bun o Playwright não lê o Set-Cookie da resposta. */
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      origin: base,
      'content-type': 'application/json',
      'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX'
    },
    body: JSON.stringify({ email, password: password.join(':') })
  })
  if (!res.ok) {
    console.error(
      `login recusado (${res.status}): ${(await res.text()).slice(0, 200)}`
    )
    process.exit(1)
  }
  for (const line of res.headers.getSetCookie()) {
    const [name, ...value] = line.split(';')[0].split('=')
    session.push({ name, value: value.join('='), url: base })
  }
}

for (const width of widths) {
  for (const theme of themes) {
    const phone = width <= 480
    const context = await browser.newContext({
      baseURL: base,
      viewport: { width, height: phone ? 844 : 800 },
      deviceScaleFactor: 2,
      isMobile: phone,
      hasTouch: phone,
      colorScheme: theme === 'dark' ? 'dark' : 'light'
    })
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('onside-tema', t)
      } catch {}
    }, theme)
    if (cookie) {
      await context.addCookies(
        cookie.split(/;\s*/).map((pair) => {
          const [name, ...value] = pair.split('=')
          return { name, value: value.join('='), url: base }
        })
      )
    }
    if (session.length) await context.addCookies(session)

    const page = await context.newPage()
    for (const path of paths) {
      await open(page, path)
      const landed = new URL(page.url()).pathname
      const name = `${label}-${path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}-${width}-${theme}`
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true })

      const top = await page.evaluate(measure)
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        ;(window as unknown as { __polishEdge: string }).__polishEdge = 'bottom'
      })
      await page.waitForTimeout(250)
      const bottom = await page.evaluate(measure)
      const findings = [...top.findings, ...bottom.findings]

      /* Movimento reduzido: o que ainda anda. Opacidade e cor podem ficar. */
      if (theme === themes[0]) {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await open(page, path)
        const moving = await page.evaluate(() =>
          document
            .getAnimations()
            .filter((a) => a.playState === 'running')
            .map((a) => {
              const effect = a.effect as KeyframeEffect
              const props = new Set(
                effect.getKeyframes().flatMap((k) => Object.keys(k))
              )
              const moves = [
                'transform',
                'translate',
                'scale',
                'rotate',
                'top',
                'left',
                'right',
                'bottom',
                'width',
                'height',
                'backgroundPosition',
                'offsetDistance'
              ].filter((p) => props.has(p))
              const target = effect.target
              const duration = Number(effect.getComputedTiming().duration)
              return moves.length && duration > 50 && target
                ? `${target.tagName.toLowerCase()}.${[...target.classList].slice(0, 2).join('.')} (${(a as CSSAnimation).animationName ?? 'transition'}: ${moves.join(', ')})`
                : null
            })
            .filter(Boolean)
        )
        for (const m of new Set(moving))
          findings.push({
            rule: 'movimento-reduzido',
            sev: 'aviso',
            n: 1,
            where: m,
            msg: 'ainda se mexe com prefers-reduced-motion',
            text: ''
          })
        await page.emulateMedia({ reducedMotion: 'no-preference' })
      }

      /* No segundo tema só sai o que o primeiro não tinha: a geometria é a mesma. */
      const id = (f: { rule: string; where: string; msg: string }) =>
        `${path}|${width}|${f.rule}|${f.where}|${f.msg}`
      const fresh = findings.filter((f) => !seen.has(id(f)))
      for (const f of findings) seen.add(id(f))
      const kept = only.length
        ? fresh.filter((f) => only.includes(f.rule))
        : fresh
      errors += kept.filter((f) => f.sev === 'erro').length
      report.push({ path, width, theme, shot: `${name}.png`, findings: kept })
      console.log(
        `\n${path}${landed === path ? '' : ` (foi para ${landed})`}  ${width}  ${theme}  (${kept.length} achados)  ${join(out, `${name}.png`)}`
      )
      for (const f of kept)
        console.log(
          `  ${f.sev === 'erro' ? 'ERRO ' : 'aviso'} ${f.rule}${f.n > 1 ? ` ×${f.n}` : ''}  ${f.where}\n        ${f.msg}${f.text ? `  «${f.text}»` : ''}`
        )
    }
    await context.close()
  }
}

await browser.close()
await Bun.write(join(out, `${label}.json`), JSON.stringify(report, null, 2))
console.log(`\n${errors} erros. Relatório: ${join(out, `${label}.json`)}`)
