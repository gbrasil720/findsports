/*
 * Gera as imagens do telão de LED da splash (rodada 1 do redesign, splash B):
 *
 * - `assets/images/splash/led.webp`: a torcida do hero da landing em pontos,
 *   papel sobre tinta e o gramado em acid, com a vinheta que escurece o meio
 *   onde fica a marca. É o mesmo desenho do `Led` da landing (quadrados de
 *   78% do passo, 10 níveis de luz), cortado em pé para o celular.
 * - `assets/images/splash/twinkle-{1,2,3}.webp`: três grupos de 6% dos pontos,
 *   cada um uma camada que escurece esses pontos. A splash anima a opacidade
 *   de cada camada num ritmo diferente: é o "pisca devagar" da landing sem
 *   desenhar ponto por ponto no JavaScript.
 * - `assets/images/splash/mark.png`: a marca (anel, bola e "ONSIDE" com o
 *   quadrado) numa caixa de MARK_BOX pt, transparente. É a imagem da splash
 *   nativa (`app.json`) e a da splash animada, no mesmo centro: na troca de
 *   uma para a outra a marca não sai do lugar.
 *
 *   bun apps/mobile/scripts/splash/generate.ts
 *
 * Usa o Chromium do Playwright do `apps/e2e`. A grade vem de
 * `apps/web/public/landing/v3/led.json`, a mesma da landing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const here = import.meta.dir
const app = join(here, '../..')
const out = join(app, 'assets/images/splash')
const ledJson = join(app, '../web/public/landing/v3/led.json')
// O app não depende do Playwright: ele vem do pacote do E2E.
const { chromium } = createRequire(join(app, '../e2e/package.json'))(
  '@playwright/test'
) as typeof import('@playwright/test')

/** A tela do design (iPhone 16e) a 3x. */
const W = 390
const H = 844
const SCALE = 3

const grids = JSON.parse(await readFile(ledJson, 'utf8')) as Record<
  string,
  { c: number; r: number; l: string; f: string }
>
const hero = grids.hero
if (!hero) throw new Error('led.json sem a grade "hero"')

await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: SCALE
})

const images = await page.evaluate(
  ({ grid, W, H, SCALE }) => {
    const dec = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
    const level = dec(grid.l)
    const field = dec(grid.f)
    const { c, r } = grid
    const p = Math.max(W / c, H / r, 5.5)
    const ox = (W - c * p) / 2
    const oy = (H - r * p) / 2
    const s = p * 0.78
    const o = (p - s) / 2
    const LV = 10
    // Sorteio fixo: a mesma imagem a cada geração.
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const group = new Uint8Array(c * r)
    for (let k = 0; k < c * r; k++) {
      const x = rnd()
      group[k] = x < 0.06 ? 1 : x < 0.12 ? 2 : x < 0.18 ? 3 : 0
    }

    const canvas = (
      draw: (x: CanvasRenderingContext2D) => void,
      opaque: boolean
    ) => {
      const cv = document.createElement('canvas')
      cv.width = W * SCALE
      cv.height = H * SCALE
      const x = cv.getContext('2d') as CanvasRenderingContext2D
      x.scale(SCALE, SCALE)
      if (opaque) {
        x.fillStyle = '#12120f'
        x.fillRect(0, 0, W, H)
      }
      draw(x)
      return cv.toDataURL('image/webp', 0.9).split(',')[1] ?? ''
    }

    const dots = (
      x: CanvasRenderingContext2D,
      pick: (k: number) => boolean,
      color: (lv: number, acid: boolean) => string
    ) => {
      for (let j = 0; j < r; j++) {
        const y = oy + j * p
        if (y < -p || y > H) continue
        for (let i = 0; i < c; i++) {
          const k = j * c + i
          const xx = ox + i * p
          if (xx < -p || xx > W || !pick(k)) continue
          const v = ((level[k] ?? 0) / 255) ** 0.9
          const lv = Math.min(LV - 1, Math.floor(v * LV))
          if (lv < 1) continue
          x.fillStyle = color(lv, Boolean(field[k]) || v > 0.93)
          x.fillRect(xx + o, y + o, s, s)
        }
      }
    }

    const led = canvas((x) => {
      dots(
        x,
        () => true,
        (lv, acid) => {
          const a = lv / (LV - 1)
          return acid
            ? `rgba(201,241,53,${Math.min(1, a * 1.05 + 0.1).toFixed(3)})`
            : `rgba(241,238,230,${(a * 0.82).toFixed(3)})`
        }
      )
      // A vinheta da splash B: escurece o meio, onde fica a marca, e as bordas.
      const mid = x.createRadialGradient(
        W / 2,
        H / 2,
        0,
        W / 2,
        H / 2,
        W * 0.64
      )
      mid.addColorStop(0, 'rgba(18,18,15,0.96)')
      mid.addColorStop(0.6, 'rgba(18,18,15,0.7)')
      mid.addColorStop(1, 'rgba(18,18,15,0)')
      x.save()
      x.translate(W / 2, H / 2)
      x.scale(1, 0.26 / 0.64 / (W / H))
      x.translate(-W / 2, -H / 2)
      x.fillStyle = mid
      x.fillRect(-W, -H, 3 * W, 3 * H)
      x.restore()
      const bottom = x.createLinearGradient(0, H, 0, H * 0.78)
      bottom.addColorStop(0, '#12120f')
      bottom.addColorStop(1, 'rgba(18,18,15,0)')
      x.fillStyle = bottom
      x.fillRect(0, 0, W, H)
      const top = x.createLinearGradient(0, 0, 0, H * 0.14)
      top.addColorStop(0, 'rgba(18,18,15,0.7)')
      top.addColorStop(1, 'rgba(18,18,15,0)')
      x.fillStyle = top
      x.fillRect(0, 0, W, H)
    }, true)

    // Cada camada só cobre os pontos do seu grupo com a tinta: a opacidade
    // da camada é quanto aqueles pontos apagam.
    const twinkles = [1, 2, 3].map((g) =>
      canvas((x) => {
        dots(
          x,
          (k) => group[k] === g,
          () => 'rgba(18,18,15,1)'
        )
      }, false)
    )
    return { led, twinkles }
  },
  { grid: hero, W, H, SCALE }
)

// A caixa da marca: a mesma medida em `components/splash.tsx` (MARK_BOX) e
// no `imageWidth` do `app.json`.
const MARK_BOX = { width: 200, height: 164 }
const anton = (
  await readFile(join(app, 'assets/fonts/Anton-Regular.ttf'))
).toString('base64')
await page.setContent(`<style>
@font-face{font-family:Anton;src:url(data:font/ttf;base64,${anton})}
html,body{margin:0;background:transparent}
#m{width:${MARK_BOX.width}px;height:${MARK_BOX.height}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#f1eee6}
.ring{width:92px;height:92px;position:relative}
.ring::before{content:"";position:absolute;inset:8px;border-radius:50%;box-shadow:inset 0 0 0 14px currentColor}
.ring::after{content:"";position:absolute;right:2px;bottom:2px;width:30px;height:30px;border-radius:50%;background:#e8320c}
.wm{font:400 56px/.9 Anton;display:flex;align-items:flex-end}
.wm i{width:10px;height:10px;background:#e8320c;margin:0 0 7px 4px}
</style><div id="m"><span class="ring"></span><div class="wm">ONSIDE<i></i></div></div>`)
await page.evaluate(() => document.fonts.ready)
await page
  .locator('#m')
  .screenshot({ path: join(out, 'mark.png'), omitBackground: true })

await writeFile(join(out, 'led.webp'), Buffer.from(images.led, 'base64'))
for (const [i, data] of images.twinkles.entries()) {
  await writeFile(
    join(out, `twinkle-${i + 1}.webp`),
    Buffer.from(data, 'base64')
  )
}
await browser.close()
console.log('splash: led.webp, 3 camadas de brilho e mark.png em', out)
