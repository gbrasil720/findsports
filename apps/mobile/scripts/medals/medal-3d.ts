import * as THREE from 'three'
import type { MedalMetal, MedalShape } from '../../lib/medals'

/*
 * A medalha 3D do design (`o3d.js` do projeto, seção 09): corpo de metal no
 * formato da conquista, aro em relevo dos dois lados, face esmaltada com o
 * número e verso gravado (as faces em canvas, `faces.js`). Geometria, luz e
 * materiais são os do design. Monta a medalha no visualizador do app
 * (`viewer.ts`, numa WebView) e nas miniaturas do gerador (Chromium).
 */

export const METAL = {
  gold: '#e2ac45',
  silver: '#d4d7dc',
  bronze: '#c47d48',
  locked: '#3e3e39'
} as const

export type MedalTextures = {
  front: THREE.Texture
  /** Branco onde a face é metal (número, aros), preto no esmalte. */
  frontMask: THREE.Texture
  back: THREE.Texture
  backBump: THREE.Texture
}

function shapeFor(kind: MedalShape, r: number) {
  const s = new THREE.Shape()
  if (kind === 'round') s.absarc(0, 0, r, 0, Math.PI * 2, false)
  else if (kind === 'shield') {
    s.moveTo(-r * 0.86, r * 0.86)
    s.quadraticCurveTo(0, r * 1.02, r * 0.86, r * 0.86)
    s.lineTo(r * 0.9, 0.05 * r)
    s.quadraticCurveTo(r * 0.82, -r * 0.62, 0, -r * 1.04)
    s.quadraticCurveTo(-r * 0.82, -r * 0.62, -r * 0.9, 0.05 * r)
    s.closePath()
  } else {
    const n = kind === 'hex' ? 6 : kind === 'oct' ? 8 : 24
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / n
      const rr = kind === 'star' && i % 2 ? r * 0.88 : r
      const x = Math.cos(a) * rr
      const y = Math.sin(a) * rr
      if (i) s.lineTo(x, y)
      else s.moveTo(x, y)
    }
    s.closePath()
  }
  return s
}

function ringShape(kind: MedalShape, r1: number, r2: number) {
  const n = kind === 'round' ? 96 : 24
  const s = new THREE.Shape(shapeFor(kind, r1).getPoints(n))
  s.holes.push(new THREE.Path(shapeFor(kind, r2).getPoints(n).reverse()))
  return s
}

function extrude(shape: THREE.Shape, depth: number, bevel: number, seg = 64) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 6,
    curveSegments: seg
  })
  g.translate(0, 0, -depth / 2)
  g.computeVertexNormals()
  return g
}

/** Placa plana com UV de 0 a 1 no quadrado de lado `2 * ur`. */
function plate(kind: MedalShape, r: number, ur: number) {
  const g = new THREE.ShapeGeometry(shapeFor(kind, r), 96)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, p.getX(i) / (2 * ur) + 0.5, p.getY(i) / (2 * ur) + 0.5)
  return g
}

export function makeMedal(
  look: { shape: MedalShape; metal: MedalMetal; lockedMetal?: string },
  locked: boolean,
  tx: MedalTextures
) {
  const g = new THREE.Group()
  const r = 1
  const metal = locked
    ? new THREE.MeshPhysicalMaterial({
        color: look.lockedMetal ?? METAL.locked,
        metalness: 0.55,
        roughness: 0.55
      })
    : new THREE.MeshPhysicalMaterial({
        color: METAL[look.metal],
        metalness: 1,
        roughness: 0.24,
        clearcoat: 0.25,
        clearcoatRoughness: 0.2
      })
  // PROTÓTIPO (medalha secreta do Jules): recortada no formato dele.
  if ((look.shape as string) === 'jules')
    return julesMedal(g, metal, locked, tx, (look as { variant?: string }).variant ?? 'a', (look as { bail?: string }).bail ?? 'ring')
  g.add(new THREE.Mesh(extrude(shapeFor(look.shape, r), 0.14, 0.055), metal))
  const rim = extrude(
    ringShape(look.shape, r * 0.985, r * 0.8),
    0.05,
    0.022,
    96
  )
  const rimFront = new THREE.Mesh(rim, metal)
  rimFront.position.z = 0.125
  g.add(rimFront)
  const rimBack = new THREE.Mesh(rim, metal)
  rimBack.position.z = -0.125
  g.add(rimBack)

  const front = new THREE.MeshPhysicalMaterial({
    map: tx.front,
    metalnessMap: tx.frontMask,
    metalness: locked ? 0.4 : 1,
    roughness: locked ? 0.6 : 0.32,
    bumpMap: tx.frontMask,
    bumpScale: 3.2,
    clearcoat: locked ? 0 : 1,
    clearcoatRoughness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4
  })
  const face = new THREE.Mesh(plate(look.shape, r * 0.8, r * 0.8), front)
  face.position.z = 0.129
  g.add(face)
  const back = new THREE.MeshPhysicalMaterial({
    map: tx.back,
    metalness: locked ? 0.5 : 1,
    roughness: locked ? 0.6 : 0.3,
    bumpMap: tx.backBump,
    bumpScale: 2.4,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4
  })
  const verso = new THREE.Mesh(plate(look.shape, r * 0.8, r * 0.8), back)
  verso.rotation.y = Math.PI
  verso.position.z = -0.129
  g.add(verso)

  // Serrilha da borda, só na redonda.
  if (look.shape === 'round') {
    const n = 140
    const teeth = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.018, 0.016, 0.15),
      metal,
      n
    )
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const z = new THREE.Vector3(0, 0, 1)
    const one = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      q.setFromAxisAngle(z, a)
      m4.compose(
        new THREE.Vector3(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0),
        q,
        one
      )
      teeth.setMatrixAt(i, m4)
    }
    g.add(teeth)
  }

  // Argola e pescoço no topo.
  const top =
    look.shape === 'shield' ? 0.96 : look.shape === 'star' ? 1.0 : 1.02
  const bail = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.045, 20, 48),
    metal
  )
  bail.position.y = top + 0.2
  bail.rotation.y = Math.PI / 2
  g.add(bail)
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.14, 24),
    metal
  )
  neck.position.y = top + 0.03
  g.add(neck)
  g.position.y = -0.1
  return g
}

/** Estúdio de painéis de luz que o metal reflete, como no design. */
export function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const pm = new THREE.PMREMGenerator(renderer)
  const studio = new THREE.Scene()
  studio.background = new THREE.Color(0x3a3a36)
  const panel = (
    w: number,
    h: number,
    p: [number, number, number],
    k: number,
    col = 0xffffff
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(col).multiplyScalar(k),
        side: THREE.DoubleSide
      })
    )
    m.position.set(...p)
    m.lookAt(0, 0, 0)
    studio.add(m)
  }
  panel(7, 3, [0, 6, 3], 4.2)
  panel(2.5, 7, [-6, 1, 3], 2.2)
  panel(3, 6, [6, 0.5, -1], 2.8, 0xfff0d6)
  panel(5, 5, [0, 1, -7], 1.2, 0xeaf2ff)
  panel(12, 3, [0, -6, 0], 0.5)
  panel(2, 2, [3, -2, 6], 1.5, 0xc9f135)
  panel(5, 3, [-1, 2, 7], 1.6)
  const env = pm.fromScene(studio, 0.02).texture
  pm.dispose()
  return env
}

/** Cena com as luzes do design e a câmera que enquadra a medalha. */
export function medalScene(env: THREE.Texture, aspect: number) {
  const scene = new THREE.Scene()
  scene.environment = env
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(2.5, 3.5, 4)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xfff4e0, 1.2)
  rim.position.set(-3, 1.5, -3)
  scene.add(rim)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444440, 0.25))
  // Perto e longe justos (a medalha cabe em ±1,3 da origem): a face fica só
  // 0,004 à frente do corpo, e com 0,1 a 50 um buffer de profundidade de 16
  // bits deixa o corpo atravessar.
  const camera = new THREE.PerspectiveCamera(26, aspect, 3, 10)
  camera.position.set(0, 0, 5.6 / Math.min(1, aspect))
  camera.lookAt(0, 0, 0)
  return { scene, camera }
}

export function setupRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.setClearColor(0x000000, 0)
}

// ---------- PROTÓTIPO: a medalha no formato do Jules ----------
// A silhueta é a da taça (`scripts/mascot/shapes.json`, corpo de 100 unidades),
// trazida para o tamanho das outras medalhas: 36 unidades = 1.
const JK = 1 / 36
const jx = (x: number) => (x - 50) * JK
const jy = (y: number) => (50 - y) * JK
type Seg = [string, ...number[]]
function jPath(target: THREE.Path, segs: Seg[], tf = (x: number, y: number) => [x, y]) {
  for (const [op, ...n] of segs) {
    const pt = (i: number) => {
      const [x, y] = tf(n[i], n[i + 1])
      return [jx(x), jy(y)] as const
    }
    if (op === 'M') target.moveTo(...pt(0))
    else if (op === 'L') target.lineTo(...pt(0))
    else target.bezierCurveTo(...pt(0), ...pt(2), ...pt(4))
  }
  target.closePath()
  return target
}
const J_BODY: Seg[] = [['M', 26, 14], ['L', 74, 14], ['L', 74, 38], ['C', 74, 51, 66, 60, 56, 62], ['L', 56, 72], ['L', 64, 72], ['C', 67, 72, 68, 74, 68, 77], ['L', 68, 82], ['C', 68, 85, 66, 86, 63, 86], ['L', 37, 86], ['C', 34, 86, 32, 85, 32, 82], ['L', 32, 77], ['C', 32, 74, 33, 72, 36, 72], ['L', 44, 72], ['L', 44, 62], ['C', 34, 60, 26, 51, 26, 38]]
const J_BOWL: Seg[] = [['M', 26, 14], ['L', 74, 14], ['L', 74, 38], ['C', 74, 51, 66, 60, 56, 62], ['L', 44, 62], ['C', 34, 60, 26, 51, 26, 38]]
const J_BASE: Seg[] = [['M', 36, 72], ['L', 64, 72], ['C', 67, 72, 68, 74, 68, 77], ['L', 68, 82], ['C', 68, 85, 66, 86, 63, 86], ['L', 37, 86], ['C', 34, 86, 32, 85, 32, 82], ['L', 32, 77], ['C', 32, 74, 33, 72, 36, 72]]
const J_HANDLES: [Seg[], Seg[]][] = [
  [[['M', 28, 47], ['C', 17, 47, 10, 41, 10, 32], ['C', 10, 24, 16, 18, 27, 20]], [['M', 27, 26], ['C', 20, 25, 16, 28, 16, 32], ['C', 16, 37, 20, 41, 27, 41]]],
  [[['M', 73, 20], ['C', 84, 18, 90, 24, 90, 32], ['C', 90, 41, 83, 47, 72, 47]], [['M', 73, 41], ['C', 80, 41, 84, 37, 84, 32], ['C', 84, 28, 80, 25, 73, 26]]]
]
/** Encolhe em torno de um centro: serve de recuo para formas quase convexas. */
const inset = (cx: number, cy: number, k: number) => (x: number, y: number) => [cx + (x - cx) * k, cy + (y - cy) * k]
/** Placa com UV num retângulo do canvas de 1024 (x0, y0, x1, y1 em px) sobre a caixa da forma. */
function jPlate(shape: THREE.Shape, px: [number, number, number, number]) {
  const g = new THREE.ShapeGeometry(shape, 96)
  g.computeBoundingBox()
  const b = g.boundingBox as THREE.Box3
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) - b.min.x) / (b.max.x - b.min.x)
    const v = (p.getY(i) - b.min.y) / (b.max.y - b.min.y)
    uv.setXY(i, (px[0] + u * (px[2] - px[0])) / 1024, 1 - (px[3] - v * (px[3] - px[1])) / 1024)
  }
  return g
}
function julesMedal(g: THREE.Group, metal: THREE.Material, locked: boolean, tx: MedalTextures, variant: string, bailKind: string) {
  // 'b': o esmalte vai quase até a borda (o Jules inteiro em acid, com fio de ouro).
  const k = variant.startsWith('b') ? 0.92 : 0.82
  const kb = variant.startsWith('b') ? 0.9 : 0.8
  const D = 0.14
  g.add(new THREE.Mesh(extrude(jPath(new THREE.Shape(), J_BODY) as THREE.Shape, D, 0.055), metal))
  for (const [outer, hole] of J_HANDLES) {
    const s = jPath(new THREE.Shape(), outer) as THREE.Shape
    s.holes.push(new THREE.Path((jPath(new THREE.Shape(), hole) as THREE.Shape).getPoints(24).reverse()))
    g.add(new THREE.Mesh(extrude(s, D * 0.8, 0.05), metal))
  }
  // Aro em relevo na boca e no pé, dos dois lados, como nas outras.
  const ring = (segs: Seg[], cx: number, cy: number, k1: number, k2: number) => {
    const s = new THREE.Shape((jPath(new THREE.Shape(), segs, inset(cx, cy, k1)) as THREE.Shape).getPoints(48))
    s.holes.push(new THREE.Path((jPath(new THREE.Shape(), segs, inset(cx, cy, k2)) as THREE.Shape).getPoints(48).reverse()))
    return extrude(s, 0.05, 0.022, 96)
  }
  for (const geo of [ring(J_BOWL, 50, 36, 0.985, k), ring(J_BASE, 50, 79, 0.975, kb)]) {
    for (const z of [0.125, -0.125]) {
      const m = new THREE.Mesh(geo, metal)
      m.position.z = z
      g.add(m)
    }
  }
  const mat = (map: THREE.Texture, mask: THREE.Texture, front: boolean) =>
    new THREE.MeshPhysicalMaterial({
      map,
      metalnessMap: front ? mask : undefined,
      metalness: locked ? 0.45 : 1,
      roughness: locked ? 0.6 : 0.32,
      bumpMap: mask,
      bumpScale: front ? 3.2 : 2.4,
      // Verniz mais contido que o das outras: o acid é claro e lavava com o reflexo.
      clearcoat: front && !locked ? 0.3 : 0,
      clearcoatRoughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    })
  const bowl = jPath(new THREE.Shape(), J_BOWL, inset(50, 36, k)) as THREE.Shape
  const base = jPath(new THREE.Shape(), J_BASE, inset(50, 79, kb)) as THREE.Shape
  const front = mat(tx.front, tx.frontMask, true)
  const back = mat(tx.back, tx.backBump, false)
  for (const [shape, px] of [[bowl, [112, 0, 912, 800]], [base, [162, 812, 862, 1018]]] as [THREE.Shape, [number, number, number, number]][]) {
    const f = new THREE.Mesh(jPlate(shape, px), front)
    f.position.z = 0.129
    g.add(f)
    const v = new THREE.Mesh(jPlate(shape, px), back)
    v.rotation.y = Math.PI
    v.position.z = -0.129
    g.add(v)
  }
  // PROTÓTIPO: a argola. 'ring' é a das outras medalhas; as demais são só dele.
  const acid = new THREE.MeshPhysicalMaterial({ color: locked ? '#24241f' : '#c9f135', metalness: 0, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3 })
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(0, y, z)
    g.add(m)
    return m
  }
  if (bailKind === 'drop') {
    // A gota do mapa (a forma dele quando procura o bar), de ponta para baixo.
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.bezierCurveTo(0.27, 0.2, 0.23, 0.52, 0, 0.52)
    s.bezierCurveTo(-0.23, 0.52, -0.27, 0.2, 0, 0)
    const hole = new THREE.Path()
    hole.absarc(0, 0.33, 0.095, 0, Math.PI * 2, true)
    s.holes.push(hole)
    put(extrude(s, 0.07, 0.025, 48), metal, 0.97)
  } else if (bailKind === 'bead') {
    // Argola de sempre, com uma conta de esmalte acid entre ela e a taça.
    put(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 24), metal, 1.02)
    put(new THREE.SphereGeometry(0.095, 32, 24), acid, 1.13)
    put(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 24), metal, 1.235)
    put(new THREE.TorusGeometry(0.13, 0.04, 20, 48), metal, 1.38).rotation.y = Math.PI / 2
  } else if (bailKind === 'ribbon') {
    // Passador de ouro e um pedaço de fita: acid com a listra de tinta.
    put(new THREE.BoxGeometry(0.1, 0.1, 0.1), metal, 1.03)
    put(new THREE.BoxGeometry(0.62, 0.075, 0.11), metal, 1.11)
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const x = c.getContext('2d') as CanvasRenderingContext2D
    x.fillStyle = locked ? '#2b2b26' : '#c9f135'
    x.fillRect(0, 0, 256, 256)
    x.fillStyle = locked ? '#1c1c19' : '#12120f'
    x.fillRect(100, 0, 56, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    const cloth = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 })
    const fita = put(new THREE.BoxGeometry(0.5, 0.5, 0.025), cloth, 1.37, -0.02)
    fita.rotation.x = -0.12
  } else {
    put(new THREE.TorusGeometry(0.15, 0.045, 20, 48), metal, 1.2).rotation.y = Math.PI / 2
    put(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 24), metal, 1.03)
  }
  // As argolas mais altas pedem a medalha um pouco menor e mais baixa no quadro.
  if (bailKind === 'bead' || bailKind === 'ribbon') g.scale.setScalar(bailKind === 'ribbon' ? 0.88 : 0.93)
  g.position.y = bailKind === 'ribbon' ? -0.3 : bailKind === 'bead' ? -0.2 : -0.1
  return g
}
