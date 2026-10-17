import * as THREE from 'three'
import { LOCKED_LIGHT, MEDAL_LOOKS, type MedalId } from '../../lib/medals'
import { drawBack, drawFront } from './faces.js'
import {
  makeEnvironment,
  makeMedal,
  medalScene,
  setupRenderer
} from './medal-3d'

/*
 * O visualizador da medalha 3D (2j e 2k do design), numa WebView do app
 * (`components/medal.tsx`). O WebGL do Safari roda o three como o design:
 * o `expo-gl` congelava a tela quando uma textura subia depois do primeiro
 * quadro e não apresentava nada num segundo contexto.
 *
 * O app manda a medalha em `window.MEDAL` antes de a página carregar e troca
 * por `setMedal`; a página avisa `ready` depois do primeiro quadro, para o app
 * mostrar a WebView sem o branco do carregamento.
 */

type Medal = {
  id: MedalId
  name: string
  locked: boolean
  /** "04.10.2026" e "BOTECO SETE", gravados no verso. */
  date?: string
  where?: string
  /** `drag`: gira com o dedo e balança de leve; `spin`: gira sozinha. */
  mode: 'drag' | 'spin'
  /** Ângulo inicial, em graus. */
  yaw: number
  reduced: boolean
  /** Tema claro: a bloqueada sai em cinza-pedra. */
  light?: boolean
}

declare global {
  interface Window {
    MEDAL?: Medal
    setMedal: (medal: Medal) => void
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
})
renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1))
renderer.setSize(window.innerWidth, window.innerHeight, false)
setupRenderer(renderer)
const { scene, camera } = medalScene(
  makeEnvironment(renderer),
  window.innerWidth / window.innerHeight
)

const face = (draw: (ctx: CanvasRenderingContext2D) => void, srgb: boolean) => {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 1024
  draw(c.getContext('2d') as CanvasRenderingContext2D)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

let config: Medal | null = null
let medal: THREE.Group | null = null
const state = { yaw: 0, pitch: 0, velocity: 0, dragging: false }

function build(next: Medal) {
  const look = {
    ...MEDAL_LOOKS[next.id],
    ...(next.light ? LOCKED_LIGHT : {}),
    ...next
  }
  if (medal) {
    scene.remove(medal)
    medal.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const m = mesh.material as THREE.MeshPhysicalMaterial | undefined
      for (const t of [m?.map, m?.metalnessMap, m?.bumpMap]) t?.dispose()
      m?.dispose()
    })
  }
  medal = makeMedal(look, next.locked, {
    front: face((c) => drawFront(c, look, next.locked, false), true),
    frontMask: face((c) => drawFront(c, look, next.locked, true), false),
    back: face((c) => drawBack(c, look, next.locked, false), true),
    backBump: face((c) => drawBack(c, look, next.locked, true), false)
  })
  scene.add(medal)
  config = next
  state.yaw = (next.yaw * Math.PI) / 180
  state.pitch = 0
  state.velocity = 0
}

// As fontes só carregam quando alguém pede: o canvas não pede sozinho.
const fonts = Promise.all([
  document.fonts.load('100px Anton'),
  document.fonts.load('600 40px "Geist Mono"')
])

window.setMedal = (next) => {
  fonts.then(() => {
    build(next)
    drawn = ''
  })
}

// Arraste: o mesmo do design (0,012 rad por ponto, inércia de 0,94).
let px = 0
let py = 0
canvas.addEventListener('pointerdown', (e) => {
  if (config?.mode !== 'drag') return
  state.dragging = true
  state.velocity = 0
  px = e.clientX
  py = e.clientY
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
  if (!state.dragging) return
  const dx = e.clientX - px
  const dy = e.clientY - py
  px = e.clientX
  py = e.clientY
  state.yaw += dx * 0.012
  state.velocity = dx * 0.012
  state.pitch = Math.max(-0.6, Math.min(0.6, state.pitch + dy * 0.008))
})
const release = () => {
  state.dragging = false
}
canvas.addEventListener('pointerup', release)
canvas.addEventListener('pointercancel', release)

let drawn = ''
let last = performance.now()
let ready = false
const loop = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (medal && config) {
    const still = config.reduced
    if (!state.dragging) {
      if (config.mode === 'spin' && !still) state.yaw += dt * 0.7
      state.yaw += state.velocity
      state.velocity *= 0.94
      if (Math.abs(state.velocity) < 0.0005) state.velocity = 0
    }
    const sway =
      config.mode === 'drag' && !state.dragging && !still
        ? Math.sin((now / 1000) * 0.8) * 0.12
        : 0
    medal.rotation.y = state.yaw + sway
    medal.rotation.x = state.pitch
    // Parada, não desenha de novo: o shader da medalha é caro.
    const pose = `${medal.rotation.y.toFixed(4)} ${state.pitch.toFixed(4)}`
    if (pose !== drawn) {
      drawn = pose
      renderer.render(scene, camera)
      if (!ready) {
        ready = true
        window.ReactNativeWebView?.postMessage('ready')
      }
    }
  }
  requestAnimationFrame(loop)
}

fonts.then(() => {
  if (window.MEDAL) build(window.MEDAL)
  requestAnimationFrame(loop)
})
