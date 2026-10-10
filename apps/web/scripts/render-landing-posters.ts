/**
 * Regera os pôsteres da landing (WEB-333).
 *
 *     cd apps/web && bun scripts/render-landing-posters.ts [--out <dir>]
 *
 * Fora do desktop a landing não roda WebGL: o hero e o CTA final mostram uma
 * imagem parada das mesmas cenas. Este script as renderiza a partir do
 * `hero-scenes.js` do protótipo (cópia em `landing-posters/`, three r128 de
 * `node_modules`) num Chromium do Playwright, e grava:
 *
 * - `public/landing/*.webp`: o hero em paisagem, o hero em retrato e o bar
 *   do CTA final;
 * - `src/components/landing/hero-posters.json`: dimensões e, para cada
 *   enquadramento do hero, os seis tempos do ciclo de cards, com o lugar em
 *   que o pino de cada bar caiu na imagem (em porcentagem). Os cards e o
 *   pulso do pôster saem daí, não de medida a olho.
 *
 * Com `--out` grava tudo em outro diretório, para comparar enquadramentos sem
 * tocar no que está publicado.
 *
 * ## Como a imagem sai igual toda vez
 *
 * O relógio e o `requestAnimationFrame` da página são de mentira: o script
 * avança os frames à mão. Sem isso os carros, o balanço dos pinos e o bar aceso
 * do ciclo mudariam a cada execução. O pôster sai com todos os bares apagados,
 * porque quem acende um de cada vez é o CSS.
 *
 * A fonte Anton é carregada antes de as cenas existirem: os letreiros são
 * texturas desenhadas em canvas, e sem a fonte pronta saem em Impact.
 *
 * ## Requisito
 *
 * Chromium do Playwright (`cd apps/e2e && bunx playwright install chromium`).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

type Camera = {
  target: [number, number, number]
  yaw: number
  pitch: number
  radius: number
}

type Shot = {
  file: string
  scene: 'mapa' | 'marca'
  /** Pixels da imagem. A cena é renderizada nesse tamanho, com DPR 1. */
  width: number
  height: number
  quality: number
  /** Só no `mapa`: troca o enquadramento aprovado do protótipo. */
  camera?: Camera
  /** Só no `marca`: quanto o bar já girou com a rolagem (0 a 1). */
  progress?: number
}

const SHOTS: Record<string, Shot> = {
  // Enquadramento aprovado. Largo (2,4:1) porque a cena tem campo de visão
  // vertical fixo: a página encaixa pela altura e corta as laterais, e assim o
  // pôster bate com o canvas em qualquer janela de desktop.
  landscape: {
    file: 'hero-mapa-paisagem.webp',
    scene: 'mapa',
    width: 1920,
    height: 800,
    quality: 0.8
  },
  // O protótipo não tem versão em retrato: abaixo de 1,3 de proporção ele só
  // afasta a câmera. Este enquadramento (5:4, escolhido pelo dono entre três)
  // chega perto dos bares da frente; a imagem fica baixa, e o botão principal
  // cabe na primeira tela até em celular pequeno.
  portrait: {
    file: 'hero-mapa-retrato.webp',
    scene: 'mapa',
    width: 1170,
    height: 936,
    quality: 0.8,
    camera: { target: [15.5, 0.5, -20], yaw: 0.142, pitch: 0.38, radius: 50 }
  },
  final: {
    file: 'final-bar.webp',
    scene: 'marca',
    width: 1488,
    height: 744,
    quality: 0.8,
    progress: 0.3
  }
}

/** Posição de um bar na imagem, em porcentagem da largura e da altura. */
type Spot = {
  bar: number
  /** Onde o card se apoia: logo acima da cabeça do pino. */
  x: number
  y: number
  /** Centro e raio da cabeça do pino, para o pulso. Raio em % da largura. */
  pinX: number
  pinY: number
  pinR: number
}

/**
 * Bares cujo card cabe na imagem. Em paisagem é a regra da própria cena, na
 * janela de 1440×900 do desenho: do meio para a direita, longe do texto, do
 * cabeçalho e do rodapé do hero. Em retrato a imagem ocupa a largura de um
 * celular (390 px): o card não pode subir para baixo do cabeçalho (66 px) nem
 * descer para a faixa em que a imagem some atrás do texto.
 */
function eligible(spot: Spot, shot: Shot) {
  if (!shot.camera) {
    const scale = 900 / shot.height
    const x = 720 + ((spot.x / 100) * shot.width - shot.width / 2) * scale
    const y = (spot.y / 100) * 900
    return x > 720 && x < 1410 && y > 165 && y < 790
  }
  const y = (spot.y / 100) * shot.height * (390 / shot.width)
  return spot.x > 8 && spot.x < 92 && y > 66 + 62 && spot.y < 74
}

/**
 * O ciclo do pôster tem sempre seis tempos de 3,4 s, como o da cena. Com menos
 * de seis bares elegíveis, os tempos que sobram repetem bares, de um jeito que
 * o mesmo nunca apareça duas vezes seguidas.
 */
function cycle(spots: Spot[]) {
  const n = spots.length
  if (n === 0) throw new Error('nenhum bar cabe neste enquadramento')
  for (let offset = 0; offset < n; offset++) {
    const slots = Array.from(
      { length: 6 },
      (_, i) => spots[i < n ? i : (i - n + offset) % n] as Spot
    )
    if (n === 1 || slots.every((s, i) => s !== slots[(i + 1) % 6])) return slots
  }
  throw new Error('ciclo sem repetição vizinha não fechou')
}

const here = dirname(fileURLToPath(import.meta.url))
const web = resolve(here, '..')
const outFlag = process.argv.indexOf('--out')
const out = outFlag > -1 ? resolve(process.argv[outFlag + 1] ?? '.') : null
const imageDir = out ?? resolve(web, 'public/landing')
const dataFile = out
  ? resolve(out, 'hero-posters.json')
  : resolve(web, 'src/components/landing/hero-posters.json')

const FILES: Record<string, string> = {
  '/three.js': resolve(web, 'node_modules/three/build/three.min.js'),
  '/hero-scenes.js': resolve(here, 'landing-posters/hero-scenes.js'),
  '/anton.woff2': resolve(web, 'public/fonts/onside/anton-latin-400.woff2')
}

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:"Anton";font-weight:400;src:url("/anton.woff2") format("woff2")}
html,body{margin:0;background:#12120f}
canvas{display:block;width:100vw;height:100vh}
</style>
<canvas></canvas>`

async function render(shot: Shot) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1
  })
  page.on('pageerror', (error) => {
    throw error
  })
  await page.route('http://poster.local/**', (route) => {
    const file = FILES[new URL(route.request().url()).pathname]
    return file
      ? route.fulfill({ path: file })
      : route.fulfill({ contentType: 'text/html', body: PAGE })
  })
  await page.addInitScript(() => {
    // Relógio e frames na mão do script (ver o cabeçalho do arquivo).
    let now = 1000
    const queue: FrameRequestCallback[] = []
    performance.now = () => now
    window.requestAnimationFrame = (callback) => queue.push(callback)
    Object.assign(window, {
      ONSIDE_PRESERVE_BUFFER: true,
      stepFrames(frames: number) {
        for (let i = 0; i < frames; i++) {
          now += 1000 / 60
          for (const callback of queue.splice(0)) callback(now)
        }
      }
    })
  })
  await page.goto('http://poster.local/')
  await page.evaluate(() => document.fonts.load('700 74px Anton'))
  await page.addScriptTag({ url: '/three.js' })
  await page.addScriptTag({ url: '/hero-scenes.js' })

  const result = await page.evaluate(
    async ({ shot }) => {
      // biome-ignore lint/suspicious/noExplicitAny: globais do protótipo, sem tipo
      const w = window as any
      const THREE = w.THREE as typeof import('three')
      const canvas = document.querySelector('canvas') as HTMLCanvasElement

      // As cenas não devolvem a câmera nem os objetos; guarda os que criarem.
      const made: {
        scene?: import('three').Scene
        camera?: import('three').PerspectiveCamera
      } = {}
      const { Scene, PerspectiveCamera } = THREE
      w.THREE.Scene = class extends Scene {
        constructor() {
          super()
          made.scene = this
        }
      }
      w.THREE.PerspectiveCamera = class extends PerspectiveCamera {
        constructor(...args: number[]) {
          super(...args)
          made.camera = this
        }
      }

      const handle = w.OnsideScenes[shot.scene](canvas, {})
      const { scene, camera } = made
      if (!scene || !camera) throw new Error('cena sem câmera')
      // O `ResizeObserver` da cena precisa de uma volta de layout de verdade.
      await new Promise((done) => setTimeout(done, 100))

      if (shot.camera) {
        // A cena reposiciona a câmera a cada frame; daqui em diante ela fica
        // onde este script mandar, e os pinos se viram para a posição nova.
        const { target, yaw, pitch, radius } = shot.camera
        THREE.Vector3.prototype.set.call(
          camera.position,
          target[0] + radius * Math.sin(yaw) * Math.cos(pitch),
          target[1] + radius * Math.sin(pitch),
          target[2] + radius * Math.cos(yaw) * Math.cos(pitch)
        )
        camera.position.set = () => camera.position
        const lookAt = camera.lookAt.bind(camera)
        camera.lookAt = () => lookAt(...target)
      }
      if (shot.progress !== undefined) handle.setProgress(shot.progress)

      // Sem o chuvisco aleatório das TVs.
      Math.random = () => 0.5
      w.stepFrames(30)

      const bars = scene.children
        .flatMap((child) => child.children)
        .filter((child) => child.userData.cfg && child.userData.hit)
      if (shot.scene === 'mapa') {
        // Todos apagados: o ciclo dá `glow` 1 ao bar da vez, e um frame com
        // este valor de partida o deixa em zero exato.
        const lit = Math.max(...bars.map((bar) => bar.userData.glow))
        for (const bar of bars) {
          bar.userData.glow = bar.userData.glow === lit ? -0.08 / 0.92 : 0
        }
        w.stepFrames(1)
      }

      const point = new THREE.Vector3()
      const project = (pin: import('three').Object3D, x: number, y: number) => {
        point.set(x, y, 0)
        pin.localToWorld(point).project(camera)
        return [(point.x * 0.5 + 0.5) * 100, (-point.y * 0.5 + 0.5) * 100]
      }
      const round = (value: number) => Math.round(value * 100) / 100
      // A cabeça do pino é um círculo de raio 16 no desenho de 36×46
      // (`map-icons.ts`), na escala 0,056 da cena; centro em (18, 17).
      const headY = (45.5 - 17) * 0.056
      const headR = 16 * 0.056
      const spots =
        shot.scene === 'mapa'
          ? bars.map((bar) => {
              const pin = bar.userData.pin
              const [x, y] = project(pin, 0, 2.6)
              const [pinX, pinY] = project(pin, 0, headY)
              const [edgeX] = project(pin, headR, headY)
              return {
                bar: bar.userData.cfg.index as number,
                x: round(x),
                y: round(y),
                pinX: round(pinX),
                pinY: round(pinY),
                pinR: round(Math.abs(edgeX - pinX))
              }
            })
          : []

      // O canvas da cena é transparente; a página o mostra sobre a tinta.
      const flat = document.createElement('canvas')
      flat.width = canvas.width
      flat.height = canvas.height
      const context = flat.getContext('2d') as CanvasRenderingContext2D
      context.fillStyle = '#12120f'
      context.fillRect(0, 0, flat.width, flat.height)
      context.drawImage(canvas, 0, 0)
      return {
        spots,
        size: [flat.width, flat.height],
        webp: flat.toDataURL('image/webp', shot.quality).split(',')[1]
      }
    },
    { shot }
  )
  await page.close()

  if (result.size[0] !== shot.width || result.size[1] !== shot.height) {
    throw new Error(`${shot.file}: saiu ${result.size.join('×')}`)
  }
  const bytes = Buffer.from(result.webp ?? '', 'base64')
  writeFileSync(resolve(imageDir, shot.file), bytes)
  console.log(
    `${shot.file}  ${shot.width}×${shot.height}  ${(bytes.length / 1024).toFixed(1)} KB`
  )
  return result.spots as Spot[]
}

mkdirSync(imageDir, { recursive: true })
const browser = await chromium.launch()
const data: Record<string, unknown> = {}
for (const [name, shot] of Object.entries(SHOTS)) {
  const spots = await render(shot)
  const fits = spots.filter((spot) => eligible(spot, shot))
  if (shot.scene === 'mapa') {
    console.log(`  cards: ${fits.map((spot) => spot.bar).join(', ')}`)
  }
  data[name] = {
    src: `/landing/${shot.file}`,
    width: shot.width,
    height: shot.height,
    ...(shot.scene === 'mapa' ? { spots: cycle(fits) } : {})
  }
}
await browser.close()
writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`)
console.log(`dados em ${dataFile}`)
