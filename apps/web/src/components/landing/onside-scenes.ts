/**
 * Cenas 3D da landing (WEB-333): `mapa` (hero) e `marca` (CTA final).
 *
 * Porte do `hero-scenes.js` do protótipo (cópia em
 * `scripts/landing-posters/`, que é de onde saem os pôsteres). Geometria,
 * cores, câmera e tempos são os de lá, e o three fica na r128 por isso: o
 * pôster e a cena viva têm de bater em cor e luz. Não atualize um sem o outro.
 *
 * O que muda em relação ao protótipo é só o que protege máquina fraca:
 * contexto que recusa renderização por software, DPR limitado, um aquecimento
 * que desiste se o frame sair caro, e um laço que para de verdade na pausa.
 *
 * Este módulo é o único que importa `three`. Quem o carrega é
 * `onside-scene-stage.tsx`, por `import()`, só no desktop.
 */

import * as THREE from 'three'

/** Teto do `devicePixelRatio` usado no canvas. */
export const MAX_PIXEL_RATIO = 1.5
/** Frames medidos, com o canvas ainda invisível, antes de a cena aparecer. */
export const WARMUP_FRAMES = 60
/** Média por frame, no aquecimento, acima da qual a cena é descartada. */
export const MAX_WARMUP_FRAME_MS = 33

const INK = 0x12120f
const PAPER = 0xf1eee6
const ACID = 0xc9f135
const LIVE = 0xe8320c

export type SceneHandle = {
  pause(): void
  resume(): void
  dispose(): void
}

type SceneOptions = {
  /** Fim do aquecimento: `false` quando a máquina não segura a cena. */
  onWarm?: (ok: boolean) => void
}

function makeRenderer(canvas: HTMLCanvasElement) {
  // O contexto nasce aqui, e não dentro do three: sem WebGL ele escreve um
  // `console.error` antes de lançar. Assim a falta de WebGL é só um `null`.
  const attributes: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    failIfMajorPerformanceCaveat: true
  }
  const context =
    canvas.getContext('webgl2', attributes) ??
    canvas.getContext('webgl', attributes)
  if (!context) return null
  const r = new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: true
  })
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
  r.setClearColor(0x000000, 0)
  return r
}

/**
 * Mede o custo médio de frame. O primeiro não conta: é ele que compila os
 * shaders e sobe as texturas, e uma máquina boa também demora nele.
 */
function warmUp(done?: (ok: boolean) => void) {
  let seen = 0
  let since = 0
  return {
    frame(now: number) {
      if (seen < 0) return
      if (seen === 1) since = now
      if (seen === WARMUP_FRAMES + 1) {
        seen = -1
        done?.((now - since) / WARMUP_FRAMES <= MAX_WARMUP_FRAME_MS)
        return
      }
      seen++
    },
    /** Depois de uma pausa o intervalo entre frames não mede nada. */
    restart() {
      if (seen >= 0) seen = 0
    }
  }
}

function fit(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
) {
  const w = canvas.clientWidth || 1
  const h = canvas.clientHeight || 1
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function disposeAll(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const m of materials) {
        const map = (m as THREE.MeshBasicMaterial).map
        if (map) map.dispose()
        m.dispose()
      }
    }
  })
  renderer.dispose()
  // Devolve o contexto na hora: o navegador limita quantos ficam vivos.
  renderer.forceContextLoss()
}

function cloud(pos: number[], col: number[], size: number, opacity: number) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity,
      sizeAttenuation: true,
      depthWrite: false
    })
  )
}

/* ---------- textures ---------- */
function stripeTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d') as CanvasRenderingContext2D
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f1eee6' : '#e8320c'
    g.fillRect(i * 32, 0, 32, 64)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.repeat.x = 1.5
  return t
}

function signTexture(name: string) {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 112
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#12120f'
  g.fillRect(0, 0, 640, 112)
  g.fillStyle = '#f1eee6'
  g.font = '700 74px Anton, "Arial Narrow", Impact, sans-serif'
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.fillText(name.toUpperCase(), 320, 60, 560)
  g.fillStyle = '#e8320c'
  g.fillRect(596, 74, 22, 22)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  return t
}

/* ---------- boteco model ---------- */
type Shared = {
  wall: THREE.MeshLambertMaterial
  wallDark: THREE.MeshLambertMaterial
  ink: THREE.MeshLambertMaterial
  roof: THREE.MeshLambertMaterial
  walk: THREE.MeshLambertMaterial
  table: THREE.MeshLambertMaterial
  chair: THREE.MeshLambertMaterial
  chair2: THREE.MeshLambertMaterial
  stripe: THREE.MeshLambertMaterial
  box: THREE.BoxGeometry
  cyl: THREE.CylinderGeometry
  ring: THREE.RingGeometry
  pinBody: THREE.ExtrudeGeometry
  pinOutline: THREE.ExtrudeGeometry
  pinDisc: THREE.CylinderGeometry
  pinCenter: [number, number]
}

let SHARED: Shared | undefined

function shared(): Shared {
  if (SHARED) return SHARED
  // O pino do app (map-icons.ts): gota 36×46 com contorno ink e círculo paper, extrudada. Ponta na origem.
  const k = 0.056
  const P = (x: number, y: number): [number, number] => [
    (x - 18) * k,
    (45.5 - y) * k
  ]
  function drop(scale: number) {
    const s = new THREE.Shape()
    const q = (x: number, y: number): [number, number] => {
      const [a, b] = P(x, y)
      return [a * scale, b * scale]
    }
    s.moveTo(...q(18, 1))
    s.bezierCurveTo(...q(26.8, 1), ...q(34, 8.1), ...q(34, 16.9))
    s.bezierCurveTo(...q(34, 28.3), ...q(19.8, 43.3), ...q(19, 44.1))
    s.bezierCurveTo(...q(19, 45.4), ...q(17, 45.4), ...q(17, 44.1))
    s.bezierCurveTo(...q(16.2, 43.3), ...q(2, 28.3), ...q(2, 16.9))
    s.bezierCurveTo(...q(2, 8.1), ...q(9.2, 1), ...q(18, 1))
    return s
  }
  const body = drop(1)
  const hole = new THREE.Path()
  const [hx, hy] = P(18, 17)
  hole.absarc(hx, hy, 6.5 * k, 0, Math.PI * 2, true)
  body.holes.push(hole)
  SHARED = {
    wall: new THREE.MeshLambertMaterial({ color: 0xd9d2c1 }),
    wallDark: new THREE.MeshLambertMaterial({ color: 0xbfb8a6 }),
    ink: new THREE.MeshLambertMaterial({ color: 0x1a1a16 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x5c5950 }),
    walk: new THREE.MeshLambertMaterial({ color: 0x2c2c27 }),
    table: new THREE.MeshLambertMaterial({ color: 0xe7e3db }),
    chair: new THREE.MeshLambertMaterial({ color: 0xe8320c }),
    chair2: new THREE.MeshLambertMaterial({ color: 0xc9f135 }),
    stripe: new THREE.MeshLambertMaterial({ map: stripeTexture() }),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
    ring: new THREE.RingGeometry(0.5, 0.9, 40),
    pinBody: new THREE.ExtrudeGeometry(body, {
      depth: 0.16,
      bevelEnabled: false
    }),
    pinOutline: new THREE.ExtrudeGeometry(drop(1.09), {
      depth: 0.1,
      bevelEnabled: false
    }),
    pinDisc: new THREE.CylinderGeometry(6.4 * k, 6.4 * k, 0.1, 28),
    pinCenter: [hx, hy]
  }
  return SHARED
}

function box(
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number
) {
  const m = new THREE.Mesh(shared().box, mat)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  return m
}

function cyl(
  mat: THREE.Material,
  r: number,
  h: number,
  x: number,
  y: number,
  z: number
) {
  const m = new THREE.Mesh(shared().cyl, mat)
  m.scale.set(r * 2, h, r * 2)
  m.position.set(x, y, z)
  return m
}

type BarConfig = {
  index: number
  name: string
  x: number
  z: number
  live?: boolean
}

/** Estado de um bar, guardado no `userData` do grupo. */
type BarData = {
  tvMat: THREE.MeshBasicMaterial
  spillMat: THREE.MeshBasicMaterial
  signMat: THREE.MeshBasicMaterial
  pin: THREE.Group
  head: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshLambertMaterial>
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  hit: THREE.Mesh
  glow: number
  target: number
  phase: number
  flick: number
  eligible?: boolean
}

function makeBar(cfg: BarConfig, rnd: () => number) {
  const S = shared()
  const g = new THREE.Group()
  g.position.set(cfg.x, 0, cfg.z)
  // sidewalk slab + body
  g.add(box(S.walk, 8.2, 0.14, 7.4, 0, 0.07, 0.9))
  g.add(box(S.wall, 5.4, 2.5, 4.4, 0, 1.39, 0))
  g.add(box(S.wallDark, 5.4, 0.28, 4.4, 0, 0.28, 0)) // rodapé
  g.add(box(S.roof, 5.2, 0.12, 4.2, 0, 2.7, 0)) // laje
  g.add(box(S.ink, 5.7, 0.42, 4.7, 0, 2.86, 0)) // platibanda
  g.add(box(S.wallDark, 0.9, 0.7, 0.9, -1.6, 3.35, -1.2)) // caixa d'água
  g.add(box(S.ink, 0.5, 0.7, 0.5, 1.9, 3.3, -1.4)) // chaminé/duto
  // facade (front = +z)
  g.add(box(S.ink, 0.95, 1.95, 0.1, -1.75, 1.12, 2.22)) // porta
  g.add(box(S.ink, 2.8, 1.6, 0.08, 0.75, 1.62, 2.21)) // moldura vitrine
  const tvMat = new THREE.MeshBasicMaterial({ color: 0x6a86c4 })
  const tv = box(tvMat, 2.55, 1.35, 0.06, 0.75, 1.62, 2.25)
  g.add(tv)
  const spillMat = new THREE.MeshBasicMaterial({
    color: 0x8fb0ff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), spillMat)
  spill.rotation.x = -Math.PI / 2
  spill.position.set(0.75, 0.16, 3.6)
  g.add(spill)
  // toldo listrado
  const awn = box(S.stripe, 3.4, 0.07, 1.35, 0.75, 2.42, 2.9)
  awn.rotation.x = 0.42
  g.add(awn)
  g.add(cyl(S.ink, 0.04, 2.1, -0.85, 1.05, 3.5))
  g.add(cyl(S.ink, 0.04, 2.1, 2.35, 1.05, 3.5))
  // letreiro
  const signMat = new THREE.MeshBasicMaterial({
    map: signTexture(cfg.name),
    color: 0x9a9a9a
  })
  const sign = box(signMat, 4.8, 0.84, 0.14, 0, 3.55, 2.05)
  g.add(sign)
  // mesinhas na calçada
  const tables: [number, number][] = [
    [-2.6, 3.4],
    [-0.4, 4.1],
    [2.3, 3.5]
  ]
  tables.forEach(([tx, tz], i) => {
    const top = cyl(S.table, 0.48, 0.06, tx, 0.82, tz)
    g.add(top)
    g.add(cyl(S.ink, 0.04, 0.7, tx, 0.45, tz))
    g.add(cyl(S.ink, 0.22, 0.04, tx, 0.14, tz))
    const n = 2 + (i % 2)
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2
      const r = 0.78
      const ch = box(
        k % 2 ? S.chair2 : S.chair,
        0.36,
        0.36,
        0.36,
        tx + Math.cos(a) * r,
        0.32,
        tz + Math.sin(a) * r
      )
      ch.rotation.y = -a
      g.add(ch)
    }
  })
  // marcador = o pino do app, em 3D, ancorado pela ponta no telhado e sempre de frente para a câmera
  const col = cfg.live ? LIVE : ACID
  const pin = new THREE.Group()
  pin.position.set(0, 3.1, -0.4)
  const head = new THREE.Mesh(
    S.pinBody,
    new THREE.MeshLambertMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.35
    })
  )
  head.position.z = 0.02
  const outline = new THREE.Mesh(
    S.pinOutline,
    new THREE.MeshBasicMaterial({ color: 0x12120f })
  )
  outline.position.set(0, -0.11, -0.06)
  const disc = new THREE.Mesh(
    S.pinDisc,
    new THREE.MeshBasicMaterial({ color: 0xf1eee6 })
  )
  disc.rotation.x = Math.PI / 2
  disc.position.set(S.pinCenter[0], S.pinCenter[1], 0.1)
  const ring = new THREE.Mesh(
    S.ring,
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  ring.scale.set(0.9, 0.5, 1)
  pin.add(outline, head, disc, ring)
  g.add(pin)
  // hitbox for hover
  const hit = box(
    new THREE.MeshBasicMaterial({ visible: false }),
    8.4,
    6.2,
    8,
    0,
    3,
    0.8
  )
  hit.userData.bar = cfg.index
  g.add(hit)
  const data: BarData = {
    tvMat,
    spillMat,
    signMat,
    pin,
    head,
    ring,
    hit,
    glow: 0,
    target: 0,
    phase: rnd() * 6.28,
    flick: 1
  }
  g.userData = data
  return g
}

/* ---------- CIDADE / BAIRRO ---------- */
const B = 9
const S = 2
const PITCH = B + S
const X0 = -68
const X1 = 75
const Z0 = -70
const Z1 = 32
const BARS: BarConfig[] = [
  { index: 0, name: 'Bar do Zé', x: 4.5, z: -9.8 },
  { index: 1, name: 'Sports Central', x: 15.5, z: -20.8, live: true },
  { index: 2, name: 'The Red Lion', x: 26.5, z: -9.8 },
  { index: 3, name: 'Casa da Torcida', x: 15.5, z: 1.2 },
  { index: 4, name: 'Espaço Central', x: 37.5, z: -20.8 },
  { index: 5, name: 'Bar Exemplo', x: -6.5, z: -20.8, live: true }
]
const PARKS = new Set(['-11:-24', '22:-35', '33:-2', '-22:-2', '0:-46'])

type MapaOptions = SceneOptions & {
  /** Um elemento por bar, na ordem de `BARS`: a cena os posiciona e mostra. */
  cards?: (HTMLElement | null)[]
}

export function mapa(
  canvas: HTMLCanvasElement,
  opts: MapaOptions = {}
): SceneHandle | null {
  const made = makeRenderer(canvas)
  if (!made) return null
  const renderer: THREE.WebGLRenderer = made
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(INK, 40, 105)
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300)
  // camera orbits the neighbourhood (framing of the approved shot: cam (18,22,26) → target (13,.5,-9); drag adds yaw)
  const target = new THREE.Vector3(13, 0.5, -9)
  const cam = { yaw: 0.142, yawT: 0.142, pitch: 0.546, radius: 41.4 }
  function placeCamera(dx: number, dy: number) {
    const r = cam.radius
    const p = cam.pitch + dy
    const y = cam.yaw + dx
    camera.position.set(
      target.x + r * Math.sin(y) * Math.cos(p),
      target.y + r * Math.sin(p),
      target.z + r * Math.cos(y) * Math.cos(p)
    )
    camera.lookAt(target)
  }
  placeCamera(0, 0)
  function adjustForAspect() {
    // only portrait/narrow frames pull back; wide frames keep the approved framing
    const k = camera.aspect < 1.3 ? Math.min(1.6, 1.3 / camera.aspect) : 1
    cam.radius = 41.4 * k
  }

  scene.add(new THREE.AmbientLight(0x6b6a62, 0.55))
  scene.add(new THREE.HemisphereLight(0x8d8a7c, 0x0a0a08, 0.7))
  const key = new THREE.DirectionalLight(0xf1eee6, 0.75)
  key.position.set(-24, 40, 30)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xc9f135, 0.12)
  fill.position.set(30, 20, -20)
  scene.add(fill)

  const city = new THREE.Group()
  scene.add(city)
  const rnd = seeded(11)

  /* ground: roads + empty blocks + parks */
  const TEX = 1024
  const cnv = document.createElement('canvas')
  cnv.width = cnv.height = TEX
  const g2 = cnv.getContext('2d') as CanvasRenderingContext2D
  const W = X1 - X0
  const D = Z1 - Z0
  const tx = (x: number) => ((x - X0) / W) * TEX
  const tz = (z: number) => ((z - Z0) / D) * TEX
  g2.fillStyle = '#1c1c18'
  g2.fillRect(0, 0, TEX, TEX)
  const parkBlocks: [number, number][] = []
  for (let x = X0; x < X1; x += PITCH)
    for (let z = Z0; z < Z1; z += PITCH) {
      const bx = x + S
      const bz = z + S
      const isPark = PARKS.has(`${bx}:${bz}`)
      if (isPark) parkBlocks.push([bx, bz])
      g2.fillStyle = isPark ? '#1b2313' : '#131311'
      g2.fillRect(tx(bx), tz(bz), (B / W) * TEX, (B / D) * TEX)
      if (!isPark && rnd() < 0.5) {
        g2.fillStyle = '#161613'
        g2.fillRect(
          tx(bx + 0.6),
          tz(bz + 0.6),
          ((B - 1.2) / W) * TEX,
          ((B - 1.2) / D) * TEX
        )
      }
    }
  // faixas centrais das ruas
  g2.strokeStyle = '#2a2a24'
  g2.lineWidth = 1
  g2.setLineDash([6, 6])
  for (let x = X0 + S / 2; x < X1; x += PITCH) {
    g2.beginPath()
    g2.moveTo(tx(x), 0)
    g2.lineTo(tx(x), TEX)
    g2.stroke()
  }
  for (let z = Z0 + S / 2; z < Z1; z += PITCH) {
    g2.beginPath()
    g2.moveTo(0, tz(z))
    g2.lineTo(TEX, tz(z))
    g2.stroke()
  }
  const groundTex = new THREE.CanvasTexture(cnv)
  groundTex.anisotropy = 8
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshBasicMaterial({ map: groundTex })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2)
  city.add(ground)

  /* street lights + trees */
  const warm = new THREE.Color(0xe9dcae)
  const sl: number[] = []
  const slC: number[] = []
  for (let x = X0 + S / 2; x <= X1; x += PITCH)
    for (let z = Z0; z <= Z1; z += 2.6) {
      sl.push(x + (rnd() < 0.5 ? -1.15 : 1.15), 0.2, z)
      slC.push(warm.r, warm.g, warm.b)
    }
  for (let z = Z0 + S / 2; z <= Z1; z += PITCH)
    for (let x = X0; x <= X1; x += 2.6) {
      sl.push(x, 0.2, z + (rnd() < 0.5 ? -1.15 : 1.15))
      slC.push(warm.r, warm.g, warm.b)
    }
  city.add(cloud(sl, slC, 0.18, 0.75))
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x3e5a1e })
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 })
  const treeGeo = new THREE.SphereGeometry(0.6, 10, 8)
  for (const [bx, bz] of parkBlocks) {
    for (let k = 0; k < 9; k++) {
      const x = bx + 0.8 + rnd() * (B - 1.6)
      const z = bz + 0.8 + rnd() * (B - 1.6)
      const s = 0.7 + rnd() * 0.7
      const t = new THREE.Mesh(treeGeo, treeMat)
      t.scale.setScalar(s)
      t.position.set(x, 0.9 * s + 0.3, z)
      city.add(t)
      city.add(cyl(trunkMat, 0.07, 0.6, x, 0.3, z))
    }
  }

  /* cars */
  const NC = 110
  const carPos = new Float32Array(NC * 3)
  const carCol = new Float32Array(NC * 3)
  const cars: {
    axisX: boolean
    lane: number
    dir: number
    pos: number
    speed: number
  }[] = []
  const cool = new THREE.Color(PAPER)
  const red = new THREE.Color(LIVE)
  for (let i = 0; i < NC; i++) {
    const axisX = rnd() < 0.5
    const dir = rnd() < 0.5 ? 1 : -1
    const lane =
      (axisX ? Z0 : X0) +
      Math.floor(rnd() * ((axisX ? D : W) / PITCH)) * PITCH +
      S / 2 +
      dir * 0.45
    cars.push({
      axisX,
      lane,
      dir,
      pos: (axisX ? X0 : Z0) + rnd() * (axisX ? W : D),
      speed: 3.5 + rnd() * 6
    })
    const c = (axisX ? dir > 0 : dir < 0) ? cool : red
    carCol.set([c.r, c.g, c.b], i * 3)
  }
  const carGeo = new THREE.BufferGeometry()
  const carAttr = new THREE.BufferAttribute(carPos, 3)
  carGeo.setAttribute('position', carAttr)
  carGeo.setAttribute('color', new THREE.BufferAttribute(carCol, 3))
  city.add(
    new THREE.Points(
      carGeo,
      new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      })
    )
  )

  /* bars */
  const bars = BARS.map((cfg) => {
    const b = makeBar(cfg, rnd)
    city.add(b)
    return { group: b, u: b.userData as BarData }
  })
  const hitboxes = bars.map((b) => b.u.hit)
  const cards = opts.cards ?? []

  /* interaction */
  let active = -1
  let hover = -1
  let lastHover = Number.NEGATIVE_INFINITY
  let cycleAt = 0
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const mouse = { x: 0, y: 0 }
  const smooth = { x: 0, y: 0 }
  let running = true
  let paused = false
  const t0 = performance.now()
  let lastNow = t0
  let pointerInside = false
  let dragging = false
  let dragX = 0
  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2
    pointerInside =
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom
    if (dragging) {
      const dx = e.clientX - dragX
      dragX = e.clientX
      cam.yawT = Math.max(-0.7, Math.min(0.9, cam.yawT - dx * 0.004))
      return
    }
    if (
      !pointerInside ||
      (e.target instanceof Element && e.target.closest('a,button,input'))
    ) {
      hover = -1
      canvas.style.cursor = ''
      return
    }
    ndc.set(mouse.x, -mouse.y)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(hitboxes, false)[0]
    hover = hit ? (hit.object.userData.bar as number) : -1
    canvas.style.cursor = hit ? 'pointer' : 'grab'
    if (hit) lastHover = performance.now()
  }
  function onDown(e: PointerEvent) {
    dragging = true
    dragX = e.clientX
    canvas.style.cursor = 'grabbing'
  }
  function onUp() {
    if (!dragging) return
    dragging = false
    canvas.style.cursor = 'grab'
    lastHover = performance.now()
  }
  function onLeave() {
    hover = -1
    if (!dragging) canvas.style.cursor = ''
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.style.touchAction = 'pan-y'
  const ro = new ResizeObserver(() => {
    fit(renderer, camera, canvas)
    adjustForAspect()
  })
  ro.observe(canvas)
  fit(renderer, camera, canvas)
  adjustForAspect()

  const V = new THREE.Vector3()
  const WP = new THREE.Vector3()
  const tvBase = new THREE.Color(0x4d6390)
  const tvHot = new THREE.Color(0xdbe7ff)
  const tmp = new THREE.Color()
  const signDim = new THREE.Color(0x8a8a8a)
  const signHot = new THREE.Color(0xffffff)
  const warm0 = warmUp(opts.onWarm)
  function frame(now: number) {
    if (!running || paused) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - lastNow) / 1000)
    lastNow = now
    const t = (now - t0) / 1000

    // which bar is lit: hover wins; otherwise auto-cycle (only bars whose card lands on the map side)
    if (hover >= 0) {
      active = hover
      cycleAt = now + 3400
    } else if (now - lastHover > 3500 && now > cycleAt) {
      let next = active
      let tries = 0
      do {
        next = (next + 1) % bars.length
        tries++
      } while (!bars[next].u.eligible && tries < bars.length)
      active = next
      cycleAt = now + 3400
    }

    smooth.x += (mouse.x - smooth.x) * 0.04
    smooth.y += (mouse.y - smooth.y) * 0.04
    cam.yaw += (cam.yawT - cam.yaw) * 0.08
    placeCamera(smooth.x * 0.06 + Math.sin(t * 0.09) * 0.02, -smooth.y * 0.03)
    // cars
    for (let i = 0; i < NC; i++) {
      const c = cars[i]
      c.pos += c.dir * c.speed * dt
      if (c.axisX) {
        if (c.pos > X1) c.pos = X0
        if (c.pos < X0) c.pos = X1
        carPos[i * 3] = c.pos
        carPos[i * 3 + 1] = 0.14
        carPos[i * 3 + 2] = c.lane
      } else {
        if (c.pos > Z1) c.pos = Z0
        if (c.pos < Z0) c.pos = Z1
        carPos[i * 3] = c.lane
        carPos[i * 3 + 1] = 0.14
        carPos[i * 3 + 2] = c.pos
      }
    }
    carAttr.needsUpdate = true
    // bars
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    bars.forEach(({ group: b, u }, i) => {
      u.target = i === active ? 1 : 0
      u.glow += (u.target - u.glow) * 0.08
      if (Math.random() < 0.08) u.flick = 0.82 + Math.random() * 0.25 // TV flicker
      const tvMix = 0.25 + 0.75 * u.glow
      tmp.copy(tvBase).lerp(tvHot, tvMix).multiplyScalar(u.flick)
      u.tvMat.color.copy(tmp)
      u.spillMat.opacity = (0.08 + 0.3 * u.glow) * u.flick
      u.signMat.color.copy(signDim).lerp(signHot, u.glow)
      // the app pin: grows 42/36 on highlight (like map-icons.ts), hovers a touch, always faces the camera
      const ps = 1 + (42 / 36 - 1) * u.glow
      u.pin.scale.set(ps, ps, ps)
      const bob = Math.sin(t * 1.4 + u.phase) * 0.1 + 0.12
      u.pin.position.y = 3.1 + bob
      WP.setFromMatrixPosition(u.pin.matrixWorld)
      u.pin.rotation.y =
        Math.atan2(camera.position.x - WP.x, camera.position.z - WP.z) -
        b.rotation.y
      u.ring.position.y = -bob + 0.02
      const rs = (0.75 - bob * 0.6) * ps
      u.ring.scale.set(rs, rs * 0.55, 1)
      u.ring.material.opacity = 0.3 - bob * 0.4
      u.head.material.emissiveIntensity = 0.25 + 0.4 * u.glow
      // card anchored above pin head — only when it lands on the map side, clear of copy and header
      V.set(0, 2.6, 0)
      u.pin.localToWorld(V)
      V.project(camera)
      const x = (V.x * 0.5 + 0.5) * w
      const y = (-V.y * 0.5 + 0.5) * h
      u.eligible =
        x > w * 0.5 && x < w - 30 && y > 165 && y < h - 110 && V.z < 1
      const el = cards[i]
      if (el) {
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        el.style.opacity =
          i === active && u.glow > 0.5 && (u.eligible || hover === i) && V.z < 1
            ? '1'
            : '0'
      }
    })
    renderer.render(scene, camera)
    warm0.frame(now)
  }
  let raf = requestAnimationFrame(frame)

  return {
    // O protótipo só pulava o desenho; aqui o laço para de pedir frames.
    pause() {
      paused = true
      cancelAnimationFrame(raf)
    },
    resume() {
      if (!paused || !running) return
      paused = false
      lastNow = performance.now()
      warm0.restart()
      raf = requestAnimationFrame(frame)
    },
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerleave', onLeave)
      disposeAll(scene, renderer)
    }
  }
}

/* ---------- BOTECO (um bar em destaque, girando devagar) ---------- */
export function marca(
  canvas: HTMLCanvasElement,
  opts: SceneOptions = {}
): (SceneHandle & { setProgress(p: number): void }) | null {
  const made = makeRenderer(canvas)
  if (!made) return null
  const renderer: THREE.WebGLRenderer = made
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(0, 7.5, 21)
  camera.lookAt(0, 2.2, 0)
  scene.add(new THREE.AmbientLight(0x6b6a62, 0.5))
  scene.add(new THREE.HemisphereLight(0x9a968a, 0x0a0a08, 0.75))
  const key = new THREE.DirectionalLight(0xf1eee6, 0.9)
  key.position.set(-10, 16, 12)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xc9f135, 0.25)
  rim.position.set(10, 6, -10)
  scene.add(rim)

  const rnd = seeded(9)
  const g = new THREE.Group()
  scene.add(g)
  const bar = makeBar(
    { index: 0, name: 'O jogo é aqui', x: 0, z: 0, live: true },
    rnd
  )
  bar.position.set(0, 0, -0.9)
  g.add(bar)
  const u = bar.userData as BarData
  // street slab under the bar
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(9.5, 64),
    new THREE.MeshLambertMaterial({ color: 0x1c1c18 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  g.add(ground)
  const kerb = new THREE.Mesh(
    new THREE.RingGeometry(9.3, 9.5, 64),
    new THREE.MeshBasicMaterial({
      color: 0xf1eee6,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    })
  )
  kerb.rotation.x = -Math.PI / 2
  kerb.position.y = 0.01
  g.add(kerb)

  const mouse = { x: 0, y: 0 }
  const smooth = { x: 0, y: 0 }
  const WP = new THREE.Vector3()
  let progress = 0
  let running = true
  let paused = false
  const t0 = performance.now()
  const tvBase = new THREE.Color(0x4d6390)
  const tvHot = new THREE.Color(0xdbe7ff)
  const tmp = new THREE.Color()
  function onMove(e: PointerEvent) {
    mouse.x = (e.clientX / window.innerWidth - 0.5) * 2
    mouse.y = (e.clientY / window.innerHeight - 0.5) * 2
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  const ro = new ResizeObserver(() => fit(renderer, camera, canvas))
  ro.observe(canvas)
  fit(renderer, camera, canvas)

  const warm0 = warmUp(opts.onWarm)
  function frame(now: number) {
    if (!running || paused) return
    raf = requestAnimationFrame(frame)
    const t = (now - t0) / 1000
    smooth.x += (mouse.x - smooth.x) * 0.05
    smooth.y += (mouse.y - smooth.y) * 0.05
    // turntable: slow idle spin + scroll-driven turn + pointer nudge
    g.rotation.y = -0.55 + t * 0.12 + progress * Math.PI * 0.6 + smooth.x * 0.25
    g.rotation.x = smooth.y * 0.05
    // the bar is always "on": TV flicker, warm sign, floating marker
    if (Math.random() < 0.08) u.flick = 0.85 + Math.random() * 0.22
    tmp.copy(tvBase).lerp(tvHot, 0.9).multiplyScalar(u.flick)
    u.tvMat.color.copy(tmp)
    u.spillMat.opacity = 0.3 * u.flick
    u.signMat.color.setScalar(1)
    const bob = Math.sin(t * 1.4) * 0.1 + 0.12
    u.pin.position.y = 3.1 + bob
    u.pin.scale.setScalar(42 / 36)
    WP.setFromMatrixPosition(u.pin.matrixWorld)
    u.pin.rotation.y =
      Math.atan2(camera.position.x - WP.x, camera.position.z - WP.z) -
      g.rotation.y
    u.ring.position.y = -bob + 0.02
    const rs = 0.9 - bob * 0.6
    u.ring.scale.set(rs, rs * 0.55, 1)
    u.ring.material.opacity = 0.3 - bob * 0.4
    u.head.material.emissiveIntensity = 0.6
    renderer.render(scene, camera)
    warm0.frame(now)
  }
  let raf = requestAnimationFrame(frame)

  return {
    setProgress(p) {
      progress = Math.max(0, Math.min(1, p))
    },
    pause() {
      paused = true
      cancelAnimationFrame(raf)
    },
    resume() {
      if (!paused || !running) return
      paused = false
      warm0.restart()
      raf = requestAnimationFrame(frame)
    },
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      disposeAll(scene, renderer)
    }
  }
}
