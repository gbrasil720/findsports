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
