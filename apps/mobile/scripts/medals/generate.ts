/*
 * Gera a medalha 3D do app a partir do desenho do design (seção 09):
 *
 * - `assets/medal/viewer.html`: o visualizador (`viewer.ts`) num arquivo só,
 *   com o three e as fontes embutidos, que a WebView abre sem rede;
 * - `assets/images/medals/*.webp`: a miniatura de cada medalha, ganha e
 *   bloqueada (a bloqueada também no cinza do tema claro), tirada do próprio visualizador. A estante e o perfil mostram
 *   a imagem: uma WebView por medalha pesaria.
 *
 *   bun apps/mobile/scripts/medals/generate.ts
 *
 * Usa o Chromium do Playwright da raiz (o mesmo do E2E).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ACHIEVEMENTS } from '@findsports_oficial/api/lib/achievements'
import { chromium } from 'playwright'

const here = import.meta.dir
const app = join(here, '../..')
const viewer = join(app, 'assets/medal/viewer.html')
const thumbs = join(app, 'assets/images/medals')

/** Ângulo da miniatura, o mesmo de cada medalha na estante do design (2i). */
const YAW: Record<string, number> = {
  bar1: -28,
  bar5: 22,
  bar10: -14,
  bar25: -20,
  bai3: 30,
  bai6: -20,
  esp2: 18,
  esp4: -30,
  ava1: 24,
  ava10: -18
}
/** 96 pt a 3x, o maior tamanho em que a miniatura aparece. */
const THUMB = 288

const built = await Bun.build({
  entrypoints: [join(here, 'viewer.ts')],
  target: 'browser',
  format: 'iife',
  minify: true
})
if (!built.success) throw new AggregateError(built.logs, 'build falhou')
const script = (await built.outputs[0].text()).replaceAll(
  '</script',
  '<\\/script'
)

const font = async (family: string, file: string, weight: number) =>
  `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${(
    await readFile(join(app, 'assets/fonts', file))
  ).toString('base64')})}`
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>${await font('Anton', 'Anton-Regular.ttf', 400)}${await font('Geist Mono', 'GeistMono-SemiBold.ttf', 600)}html,body{margin:0;height:100%;background:transparent;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}canvas{width:100%;height:100%;display:block}</style></head><body><canvas></canvas><script>${script}</script></body></html>`
await mkdir(join(app, 'assets/medal'), { recursive: true })
await writeFile(viewer, html)

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] })
const page = await browser.newPage({
  viewport: { width: THUMB, height: THUMB },
  deviceScaleFactor: 1
})
// Sobrescreve no lugar: apagar a pasta quebra o Metro que estiver rodando.
await mkdir(thumbs, { recursive: true })
let count = 0
for (const a of ACHIEVEMENTS) {
  for (const [locked, light] of [
    [false, false],
    [true, false],
    [true, true]
  ]) {
    await page.setContent(html)
    await page.evaluate(
      (medal) =>
        new Promise<void>((resolve) => {
          const w = window as unknown as {
            ReactNativeWebView: { postMessage: () => void }
            setMedal: (m: typeof medal) => void
          }
          w.ReactNativeWebView = { postMessage: () => resolve() }
          w.setMedal(medal)
        }),
      {
        id: a.id,
        name: a.name,
        locked,
        mode: 'spin' as const,
        yaw: YAW[a.id] ?? 0,
        reduced: true,
        light
      }
    )
    const png = await page.screenshot({ omitBackground: true })
    // O Playwright só tira PNG; o próprio Chromium converte para WebP.
    const webp = await page.evaluate(async (data) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      c.getContext('2d')?.drawImage(img, 0, 0)
      return c.toDataURL('image/webp', 0.9).split(',')[1] ?? ''
    }, png.toString('base64'))
    await writeFile(
      join(
        thumbs,
        `${a.id}${locked ? '-locked' : ''}${light ? '-light' : ''}.webp`
      ),
      Buffer.from(webp, 'base64')
    )
    count++
  }
}
await browser.close()
console.log(
  `viewer.html (${Math.round(html.length / 1024)} KB) e ${count} miniaturas`
)
