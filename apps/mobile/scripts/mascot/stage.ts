/*
 * O palco da taça, a mascote da busca com IA, dentro da WebView
 * (`components/ai/mascot.tsx`). O `open-bot-avatar` desenha o corpo com
 * volume, o olhar e o piscar; por cima vão a troca de forma (as duas
 * silhuetas interpoladas por campo de distância), a mola do corpo, os olhos
 * das cenas e os enfeites. Desenho aprovado no artifact "Taça da IA Onside".
 *
 * O app só diz o estado (`window.setMascot({ state })`); cada estado entra a
 * partir do que estiver na tela e fica até o próximo.
 */
import type { AvatarDefinition } from 'open-bot-avatar'
import { type MountedAvatar, mountAvatar } from 'open-bot-avatar/dom'
import SHAPES from './shapes.json'

export type MascotState =
  | 'idle'
  | 'thinking'
  | 'live'
  | 'searching'
  | 'comparing'
  | 'writing'
  | 'done'
  | 'empty'
  | 'awaiting'
  | 'going'
  | 'call'
  | 'remind'
  | 'refused'
  | 'stopped'
  | 'limit'
  | 'down'
  | 'offline'

export type MascotConfig = {
  state: MascotState
  dark: boolean
  reduced: boolean
}

type Shape = keyof typeof SHAPES
const DEF = SHAPES as unknown as Record<Shape, AvatarDefinition>
const HOME = DEF.taca

declare global {
  interface Window {
    MASCOT?: MascotConfig
    setMascot: (c: Partial<MascotConfig>) => void
    ReactNativeWebView?: { postMessage: (m: string) => void }
  }
}

// ---------- palco ----------
const $ = (id: string) => document.getElementById(id) as HTMLElement
const stage = $('stage')
const wrap = $('wrap')
const botEl = $('bot')
const fx = $('fx')
const shadow = $('shadow')
const orbit = $('orbit')
const glow = $('glow')
const live = $('live')
const stamp = $('stamp')

let cfg: MascotConfig = window.MASCOT ?? {
  state: 'idle',
  dark: true,
  reduced: false
}
let reduce = cfg.reduced
document.documentElement.classList.toggle('reduce', reduce)
const theme = () =>
  cfg.dark
    ? { body: '#c9f135', eye: '#12120f', fg: '#f1eee6', rgb: [201, 241, 53] }
    : { body: '#12120f', eye: '#c9f135', fg: '#12120f', rgb: [18, 18, 15] }
const GREY = [122, 124, 112]
const LIVE = '#e8320c'
const ACID = '#c9f135'

/** O corpo é um quadrado de B px; enfeites em % do corpo, a partir do centro. */
let B = 100
/** Medidas em px do artifact (corpo de 205 px) no corpo daqui. */
const px = (n: number) => (n * B) / 205
function fit() {
  B = Math.round(Math.min(stage.clientHeight * 0.6, stage.clientWidth * 0.4))
  document.documentElement.style.setProperty('--b', `${B}px`)
  const root = document.documentElement.style
  root.setProperty('--fg', theme().fg)
  root.setProperty('--accent', cfg.dark ? ACID : '#12120f')
  root.setProperty('--bg-dot', cfg.dark ? '#161613' : '#f1eee6')
  root.setProperty('--on-body', cfg.dark ? '#12120f' : '#f1eee6')
  root.setProperty('--chip-text', cfg.dark ? '#12120f' : '#f1eee6')
  root.setProperty(
    '--floor-shadow',
    cfg.dark ? 'rgba(0,0,0,.5)' : 'rgba(18,18,15,.14)'
  )
}
fit()
addEventListener('resize', fit)

for (let i = 0; i < 12; i++) {
  const b = document.createElement('b')
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2
  b.style.translate = `${Math.cos(a) * 46}cqw ${Math.sin(a) * 46}cqw`
  b.style.animationDelay = `${i * 0.1 - 1.2}s`
  orbit.append(b)
}

const bot: MountedAvatar = mountAvatar(botEl, {
  definition: HOME,
  color: theme().body,
  eyeColor: theme().eye,
  followPointer: true,
  reducedMotion: reduce,
  label: ''
})

// ---------- motor ----------
let token = 0
const alive = (t: number) => t === token
/**
 * Um estado novo cancela o anterior: tudo que espera (tween, sleep) rejeita
 * com CANCEL, e nada do estado velho continua desenhando por cima do novo.
 */
const CANCEL = Symbol('cancel')
addEventListener('unhandledrejection', (e) => {
  if ((e as Event & { reason?: unknown }).reason === CANCEL) e.preventDefault()
})
const sleep = (ms: number, t = token) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (alive(t) ? resolve() : reject(CANCEL)), ms)
  )
const frame = () => new Promise(requestAnimationFrame)
const lin = (u: number) => u
const out3 = (u: number) => 1 - (1 - u) ** 3
const in2 = (u: number) => u * u
const io = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)
const spring = (u: number) =>
  u >= 1 ? 1 : 1 - Math.exp(-6 * u) * Math.cos(11 * u)
const outBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2

type Num = Record<string, number>
const S = { x: 0, y: 0, r: 0, sx: 1, sy: 1 }
let shade = 1
function apply() {
  wrap.style.transform = `translate(${S.x}%, ${S.y}%) rotate(${S.r}deg) scale(${S.sx}, ${S.sy})`
  const lift = Math.max(0.35, 1 + S.y / 90)
  shadow.style.transform = `translate(-50%, 0) translateX(${(S.x * B) / 100}px) scale(${S.sx * lift * shade}, ${lift * (0.5 + 0.5 * shade)})`
  shadow.style.opacity = String(Math.min(1, S.sx * 1.4) * lift)
}
async function tween(ms: number, fn: (u: number) => void, t = token) {
  if (!alive(t)) throw CANCEL
  if (reduce) {
    fn(1)
    return
  }
  const start = performance.now()
  for (;;) {
    const u = Math.min(1, (performance.now() - start) / ms)
    fn(u)
    if (u === 1) return
    await frame()
    if (!alive(t)) throw CANCEL
  }
}
function mix<T extends Num>(
  obj: T,
  target: Partial<T>,
  ms: number,
  ease: (u: number) => number,
  t: number,
  after?: () => void
) {
  const from: Num = {}
  for (const k in target) from[k] = obj[k]
  return tween(
    ms,
    (u) => {
      const e = ease(u)
      for (const k in target)
        (obj as Num)[k] = from[k] + ((target[k] as number) - from[k]) * e
      after?.()
    },
    t
  )
}
const to = (target: Partial<typeof S>, ms: number, ease = out3, t = token) =>
  mix(S, target, ms, ease, t, apply)

// ---------- olhos das cenas ----------
// Um estado contínuo: `happy` vai de pílula (0) a sorriso (1) passando por um
// ponto; `open` fecha; `wide` arregala; `tilt` preocupa; `dead` é o X;
// `flat` o tracinho de sono; `wk` a piscadela.
const NEUTRAL = {
  open: 1,
  wide: 1,
  gx: 0,
  gy: 0,
  wk: 0,
  tilt: 0,
  dead: 0,
  flat: 0
}
const E = { x: 50, y: 50, sp: 16, sc: 1, happy: 0, ...NEUTRAL }
const eyesC = document.createElement('canvas')
eyesC.style.cssText =
  'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
let eyesOn = false
let blinkAt = 0
function drawEyes(now: number) {
  const px = Math.round(eyesC.clientWidth * devicePixelRatio)
  if (eyesC.width !== px) eyesC.width = eyesC.height = px
  const c = eyesC.getContext('2d') as CanvasRenderingContext2D
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, px, px)
  if (!eyesOn) return
  c.setTransform(px / 100, 0, 0, px / 100, 0, 0)
  let blink = 0
  if (!reduce && E.happy < 0.02 && E.flat < 0.02 && E.dead < 0.02) {
    if (now > blinkAt + 170) blinkAt = now + 2200 + Math.random() * 2600
    if (now >= blinkAt) blink = Math.sin((Math.PI * (now - blinkAt)) / 170)
  }
  const s = E.sc * 1.45 * E.wide
  const w = 4 * s
  const h = 11 * s
  c.fillStyle = c.strokeStyle = theme().eye
  c.lineCap = 'round'
  for (const side of [-1, 1]) {
    const cx = E.x + (side * E.sp) / 2 + E.gx * 1.5 * s
    const cy = E.y + E.gy * 1.1 * s
    const X = E.dead
    const H = X > 0 ? X : side === 1 ? Math.max(E.happy, E.wk) : E.happy
    if (H < 0.5) {
      const k = 1 - H * 2
      const ww = w * (0.6 + 0.4 * k) * (1 + 1.3 * E.flat)
      const open = Math.max(
        ww * 0.62 * (1 - 0.6 * E.flat),
        h * Math.max(0.09, E.open * (1 - blink)) * k
      )
      c.save()
      c.translate(cx, cy + (h - open) * 0.18 * k)
      c.rotate((-side * E.tilt * Math.PI) / 180)
      c.beginPath()
      c.roundRect(-ww / 2, -open / 2, ww, open, Math.min(ww, open) / 2)
      c.fill()
      c.restore()
    } else if (X > 0) {
      const r = w * 1.05 * outBack((X - 0.5) * 2)
      c.lineWidth = w * 0.6
      c.beginPath()
      c.moveTo(cx - r, cy - r)
      c.lineTo(cx + r, cy + r)
      c.moveTo(cx - r, cy + r)
      c.lineTo(cx + r, cy - r)
      c.stroke()
    } else {
      const k = outBack((H - 0.5) * 2)
      const hw = w * 0.72 * k
      c.lineWidth = w * 0.6
      c.beginPath()
      c.moveTo(cx - hw, cy + h * 0.1 * k)
      c.quadraticCurveTo(cx, cy - h * 0.42 * k, cx + hw, cy + h * 0.1 * k)
      c.stroke()
    }
  }
}
;(function loop(now: number) {
  if (eyesOn || eyesC.width) drawEyes(now)
  requestAnimationFrame(loop)
})(0)
const eye = (target: Partial<typeof E>, ms = 200, ease = out3, t = token) =>
  mix(E, target, ms, ease, t)
const eyesOf = (def: AvatarDefinition) => ({
  x: def.eyes.x,
  y: def.eyes.y,
  sp: def.eyes.spacing,
  sc: def.eyes.scale
})

// ---------- troca de forma ----------
const N = 220
const U = 100 / N
const sdfCache = new Map<string, Float32Array>()
function edt1d(f: Float64Array, n: number) {
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s: number
    do {
      const p = v[k]
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p)
    } while (s <= z[k] && --k >= 0)
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const p = v[k]
    d[q] = (q - p) * (q - p) + f[p]
  }
  return d
}
function edt(mask: Uint8Array, on: number) {
  const g = new Float64Array(N * N)
  const col = new Float64Array(N)
  for (let i = 0; i < N * N; i++) g[i] = mask[i] === on ? 0 : 1e12
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) col[y] = g[y * N + x]
    const d = edt1d(col, N)
    for (let y = 0; y < N; y++) g[y * N + x] = d[y]
  }
  for (let y = 0; y < N; y++) {
    const d = edt1d(g.subarray(y * N, y * N + N), N)
    for (let x = 0; x < N; x++) g[y * N + x] = Math.sqrt(d[x])
  }
  return g
}
function sdf(def: AvatarDefinition) {
  const hit = sdfCache.get(def.id)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = N
  const x = c.getContext('2d') as CanvasRenderingContext2D
  x.scale(N / 100, N / 100)
  x.fill(new Path2D(def.body.path), 'nonzero')
  const a = x.getImageData(0, 0, N, N).data
  const mask = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) mask[i] = a[i * 4 + 3] > 127 ? 1 : 0
  const out = edt(mask, 1)
  const inn = edt(mask, 0)
  const s = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) s[i] = (out[i] - inn[i]) * U
  sdfCache.set(def.id, s)
  return s
}
const layer = document.createElement('canvas')
layer.style.cssText =
  'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden'
wrap.append(layer, eyesC)
const buf = document.createElement('canvas')
buf.width = buf.height = N
const bctx = buf.getContext('2d') as CanvasRenderingContext2D
const img = bctx.createImageData(N, N)
let bodyRgb = theme().rgb
function paint(fn: (x: number, y: number, i: number) => number) {
  const d = img.data
  const aa = U * 0.9
  let i = 0
  for (let py = 0; py < N; py++) {
    const y = (py + 0.5) * U
    for (let px = 0; px < N; px++, i++) {
      const a = Math.max(0, Math.min(1, 0.5 - fn((px + 0.5) * U, y, i) / aa))
      const j = i * 4
      d[j] = bodyRgb[0]
      d[j + 1] = bodyRgb[1]
      d[j + 2] = bodyRgb[2]
      d[j + 3] = a * 255
    }
  }
  bctx.putImageData(img, 0, 0)
  const px = Math.round(layer.clientWidth * devicePixelRatio)
  if (layer.width !== px) layer.width = layer.height = px
  const c = layer.getContext('2d') as CanvasRenderingContext2D
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, px, px)
  c.imageSmoothingQuality = 'high'
  c.drawImage(buf, 0, 0, px, px)
}
const painting = (on: boolean) => {
  layer.style.visibility = on ? 'visible' : 'hidden'
  botEl.style.visibility = on ? 'hidden' : ''
}

const BASE = { yaw: -0.3, pitch: 0.2 } // vista de repouso da biblioteca
const FRONT = { yaw: -BASE.yaw, pitch: -BASE.pitch }
let cur = HOME
let frontal = false
let mood: 'idle' | 'thinking' | 'happy' = 'idle'
const setView = (e: number) =>
  bot.update({ view: { yaw: FRONT.yaw * e, pitch: FRONT.pitch * e } })

/** Solto, o humor é o da biblioteca; de frente, o dos nossos olhos. */
function setMood(m: typeof mood, t = token) {
  mood = m
  if (!frontal) {
    bot.update({ mood: m })
    return Promise.resolve()
  }
  return eye({ happy: m === 'happy' ? 1 : 0 }, 340, lin, t)
}
/** Vira de frente e para; os olhos passam para a nossa camada. */
async function front(t = token) {
  if (frontal) return
  await tween(140, (u) => setView(io(u)), t)
  if (!alive(t)) return
  Object.assign(E, eyesOf(cur), NEUTRAL, { happy: mood === 'happy' ? 1 : 0 })
  eyesOn = true
  frontal = true
  bot.update({
    mood: 'idle',
    reducedMotion: true,
    lookAt: null,
    eyeColor: currentBody(),
    view: FRONT
  })
}
async function release(t = token) {
  if (!frontal) return
  await eye(NEUTRAL, 160, out3, t)
  if (!alive(t)) return
  mood = E.happy > 0.5 ? 'happy' : 'idle'
  bot.update({ mood, eyeColor: theme().eye })
  eyesOn = false
  await tween(240, (u) => setView(1 - io(u)), t)
  if (!alive(t)) return
  bot.update({
    reducedMotion: reduce,
    view: { yaw: 0, pitch: 0 },
    lookAt: null
  })
  frontal = false
}
async function morph(
  def: AvatarDefinition,
  { stay = false, quick = false } = {},
  t = token
) {
  const from = cur
  if (reduce) {
    bot.update({ definition: def })
    cur = def
    if (stay) await front(t)
    else await release(t)
    Object.assign(E, eyesOf(def))
    return
  }
  if (from.id === def.id) {
    if (stay) await front(t)
    else await release(t)
    return
  }
  const sa = sdf(from)
  const sb = sdf(def)
  await Promise.all([front(t), to({ sx: 1.15, sy: 0.84 }, 150, out3, t)])
  if (!alive(t)) return
  if (E.happy > 0) {
    mood = 'idle'
    eye({ happy: 0 }, 200, lin, t)
  }
  paint((_x, _y, i) => sa[i])
  painting(true)
  await Promise.all([
    tween(
      230,
      (u) => {
        const e = io(u)
        const blob = 2.4 * Math.sin(Math.PI * u)
        paint((_x, _y, i) => sa[i] + (sb[i] - sa[i]) * e - blob)
      },
      t
    ),
    to({ sx: 0.9, sy: 1.16 }, 230, io, t),
    eye(eyesOf(def), 230, io, t),
    eye({ open: 0.35 }, 115, out3, t).then(() =>
      eye({ open: 1, wide: 1.12 }, 115, out3, t)
    )
  ])
  if (!alive(t)) return
  bot.update({ definition: def, view: FRONT })
  cur = def
  await frame()
  await frame()
  if (!alive(t)) return
  painting(false)
  await Promise.all([
    to({ sx: 1, sy: 1 }, quick ? 340 : 520, spring, t),
    eye({ wide: 1 }, quick ? 300 : 420, spring, t)
  ])
  if (!stay) await release(t)
}
const currentBody = () => theme().body

// ---------- enfeites ----------
const at = (x: number, y: number) => ({
  left: `calc(50% + ${(x * B) / 100}px)`,
  top: `calc(var(--cy) + ${(y * B) / 100}px)`
})
function add(cls: string, style: Partial<CSSStyleDeclaration>) {
  const el = document.createElement('i')
  el.className = cls
  Object.assign(el.style, style)
  fx.append(el)
  return el
}
const fade = (el: Element) =>
  el
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 200,
      fill: 'forwards'
    })
    .finished.then(() => el.remove())
    .catch(() => el.remove())
function burst(
  x: number,
  y: number,
  n: number,
  colors: string[],
  { up = 0, spread = 70, size = [5, 11], square = false } = {}
) {
  if (reduce) return
  for (let i = 0; i < n; i++) {
    const s = px(size[0] + Math.random() * (size[1] - size[0]))
    const a = Math.random() * Math.PI * 2
    const d = ((0.4 + Math.random() * 0.6) * spread * B) / 440
    const el = add('bit', {
      ...at(x, y),
      width: `${s}px`,
      height: `${s}px`,
      background: colors[i % colors.length],
      borderRadius: square && i % 2 ? '2px' : '50%'
    })
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
        { opacity: 1, offset: 0.12 },
        {
          transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - (up * B) / 44}px)) scale(1) rotate(${Math.random() * 300}deg)`,
          opacity: 0
        }
      ],
      {
        duration: 700 + Math.random() * 600,
        delay: i * 22,
        easing: 'cubic-bezier(.15,.7,.3,1)'
      }
    ).finished.then(() => el.remove())
  }
}
const confetti = () =>
  burst(0, -34, 26, [ACID, LIVE, cfg.dark ? '#f1eee6' : '#12120f'], {
    up: 14,
    spread: 150,
    square: true
  })
function ripple(x: number) {
  if (reduce) return
  const el = add('ripple', { left: `calc(50% + ${(x * B) / 100}px)` })
  el.animate(
    [
      { transform: 'translate(-50%,-50%) scale(.25)', opacity: 0.9 },
      { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }
    ],
    { duration: 520, easing: 'ease-out' }
  ).finished.then(() => el.remove())
}
function pin(x: number) {
  const el = add('pin', { left: `calc(50% + ${(x * B) / 100}px)` })
  el.dataset.x = String(x)
  const base = 'translate(-50%, -135%) rotate(-45deg)'
  el.animate(
    [
      { transform: `${base} scale(.4)`, opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { transform: `${base} scale(1.25)`, offset: 0.6 },
      { transform: `${base} scale(.92)`, offset: 0.8 },
      { transform: `${base} scale(1)` }
    ],
    { duration: reduce ? 1 : 420, fill: 'forwards', easing: 'ease-out' }
  )
  return el
}
const pins = () => [...fx.querySelectorAll<HTMLElement>('.pin')]
function wave(i: number, x = 46, y = -6, dir = 1) {
  if (reduce) return
  const el = add('wave', at(x, y))
  el.animate(
    [
      {
        transform: `translate(-50%,-50%) translateX(0) scale(${dir * 0.5}, .5)`,
        opacity: 0
      },
      { opacity: 1, offset: 0.2 },
      {
        transform: `translate(-50%,-50%) translateX(${dir * B * 0.36}px) scale(${dir * 2.3}, 2.3)`,
        opacity: 0
      }
    ],
    { duration: 620, delay: i * 90, easing: 'ease-out' }
  ).finished.then(() => el.remove())
}
function pop(cls: string, x: number, y: number, html = '') {
  const el = add(cls, at(x, y))
  el.innerHTML = html
  el.animate(
    [
      {
        transform: 'translate(-50%,-50%) scale(.6) rotate(-20deg)',
        opacity: 0
      },
      { opacity: 1, offset: 0.3 },
      {
        transform: 'translate(-50%,-50%) scale(1.2) rotate(6deg)',
        offset: 0.6
      },
      { transform: 'translate(-50%,-50%) scale(1) rotate(0)' }
    ],
    { duration: reduce ? 1 : 380, fill: 'forwards', easing: 'ease-out' }
  )
  return el
}
function zzz(n: number) {
  if (reduce) return
  for (let i = 0; i < n; i++) {
    const el = add('txt', at(26, -46))
    el.textContent = 'z'
    el.style.fontSize = `${0.9 + (i % 3) * 0.35}em`
    el.animate(
      [
        { transform: 'translate(0,0)', opacity: 0 },
        { opacity: 1, offset: 0.25 },
        {
          transform: `translate(${B * 0.2}px, ${-B * 0.32}px) rotate(14deg)`,
          opacity: 0
        }
      ],
      { duration: 1500, delay: i * 520, easing: 'ease-out' }
    ).finished.then(() => el.remove())
  }
}
const hex = (a: number[], b: number[], u: number) =>
  `#${[0, 1, 2]
    .map((i) =>
      Math.round(a[i] + (b[i] - a[i]) * u)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
function tint(a: number[], b: number[], ms: number, t: number) {
  return tween(
    ms,
    (u) => {
      const c = hex(a, b, io(u))
      bodyRgb = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * io(u)))
      bot.update(frontal ? { color: c, eyeColor: c } : { color: c })
    },
    t
  )
}

// ---------- pedaços de cena ----------
async function hop(h = 12, t = token) {
  await to({ sx: 1.1, sy: 0.9 }, 90, out3, t)
  eye({ wide: 1.1 }, 120, out3, t)
  await to({ y: -h, sx: 0.95, sy: 1.08 }, 170, out3, t)
  await to({ y: 0, sx: 1, sy: 1 }, 150, in2, t)
  eye({ wide: 1 }, 200, out3, t)
  await to({ sx: 1.12, sy: 0.88 }, 60, out3, t)
  await to({ sx: 1, sy: 1 }, 380, spring, t)
}
async function wince(t = token) {
  await eye({ open: 0.05, wide: 1.08 }, 50, out3, t)
  await eye({ open: 1, wide: 1 }, 380, spring, t)
}
async function jump(x: number, t: number, last = false) {
  const x0 = S.x
  const h = 30
  const dir = Math.sign(x - x0)
  const air = 300 + Math.abs(x - x0) * 0.6
  eye({ gx: dir * 0.9, gy: -0.3 }, 90, out3, t)
  await to({ sx: 1.14, sy: 0.84 }, 90, out3, t)
  eye({ wide: 1.15, gy: -0.6 }, 100, out3, t)
  await tween(
    air,
    (u) => {
      S.x = x0 + (x - x0) * u
      S.y = -4 * h * u * (1 - u)
      const a = Math.sin(Math.PI * u)
      S.sx = 1 - 0.08 * a
      S.sy = 1 + 0.12 * a
      S.r = (x - x0) * 0.09 * (2 * u - 1)
      apply()
    },
    t
  )
  if (!alive(t)) return
  S.r = 0
  ripple(x)
  eye({ open: 0.3, wide: 1, gy: 0.3 }, 45, out3, t).then(() =>
    eye({ open: 1, gx: 0, gy: 0 }, 220, spring, t)
  )
  await to({ sx: 1.2, sy: 0.8 }, 45, out3, t)
  await to({ sx: 1, sy: 1 }, last ? 380 : 300, spring, t)
}
const SPOTS = [-72, 70, 0]

/** Pensando: um pulso corre pela roda e ela gira no eixo, com pausa de frente. */
async function ponder(t: number) {
  while (alive(t) && !reduce) {
    await sleep(700)
    if (!alive(t)) return
    await tween(
      1000,
      (u) => bot.update({ view: { yaw: io(u) * Math.PI * 2, pitch: 0 } }),
      t
    )
  }
}

// Escrevendo: uma massa só (derrete num ponto, vira três, cometa, anel, forma).
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k))
  return b + (a - b) * h - k * h * (1 - h)
}
const blobs = (list: number[][], k: number) => (x: number, y: number) => {
  let d = 1e9
  for (const c of list) {
    const v = Math.hypot(x - c[0], y - c[1]) - c[2]
    d = d === 1e9 ? v : smin(d, v, k)
  }
  return d
}
const CX = 50
const CY = 52
const dot = (x: number, y: number) => Math.hypot(x - CX, y - CY) - 6
const three = (sep: number, r: number, bob = [0, 0, 0]) =>
  blobs(
    [-1, 0, 1].map((k, j) => [
      CX + k * sep,
      CY - 5.5 * bob[j],
      r + 0.8 * bob[j]
    ]),
    5
  )
let writing = false
async function writeIn(t: number) {
  await front(t)
  if (!alive(t)) return
  if (E.happy > 0) {
    mood = 'idle'
    eye({ happy: 0 }, 160, lin, t)
  }
  if (reduce) return
  const sa = sdf(cur)
  eye({ open: 0.25 }, 120, out3, t)
  await to({ sx: 1.14, sy: 0.84 }, 130, out3, t)
  if (!alive(t)) return
  paint((_x, _y, i) => sa[i])
  painting(true)
  writing = true
  eye({ wide: 0 }, 200, in2, t)
  await Promise.all([
    tween(
      320,
      (u) => {
        const e = io(u)
        const b = 1.6 * Math.sin(Math.PI * u)
        paint((x, y, i) => sa[i] + (dot(x, y) - sa[i]) * e - b)
      },
      t
    ),
    to({ sx: 1, sy: 1 }, 320, io, t),
    tween(320, (u) => (shade = 1 - 0.55 * io(u)), t)
  ])
  if (!alive(t)) return
  eyesOn = false
  await tween(340, (u) => paint(three(14 * outBack(u), 6 - 1.6 * u)), t)
  // digita até o próximo estado
  const start = performance.now()
  while (alive(t)) {
    const time = (performance.now() - start) / 1000
    paint(
      three(
        14,
        4.4,
        [0, 1, 2].map((j) => {
          const p = (((time * 1.45 - j * 0.16) % 1) + 1) % 1
          return p < 0.45 ? Math.sin((Math.PI * p) / 0.45) ** 2 : 0
        })
      )
    )
    await frame()
  }
}
/** Sai do "escrevendo": parou (volta seco) ou pronto (cometa, anel, forma). */
async function writeOut(t: number, next: MascotState) {
  const stopped = next === 'stopped'
  if (!writing) return
  writing = false
  const sb = sdf(HOME)
  if (cur !== HOME) {
    bot.update({ definition: HOME })
    cur = HOME
  }
  const finish = async () => {
    shade = 1
    Object.assign(E, eyesOf(cur), NEUTRAL, { wide: 0, happy: 0 })
    eyesOn = true
    painting(false)
  }
  if (stopped) {
    await tween(
      130,
      (u) => paint(three(14 * (1 - io(u)), 4.4 + 1.6 * io(u))),
      t
    )
    await Promise.all([
      tween(
        200,
        (u) => {
          const e = io(u)
          paint((x, y, i) => {
            const r = dot(x, y)
            return r + (sb[i] - r) * e - 1.5 * Math.sin(Math.PI * u)
          })
        },
        t
      ),
      to({ sx: 0.92, sy: 1.12 }, 200, io, t),
      tween(200, (u) => (shade = 0.45 + 0.55 * io(u)), t)
    ])
    await finish()
    eye({ wide: 1.2 }, 120, out3, t).then(() =>
      eye({ wide: 1 }, 400, spring, t)
    )
    await to({ sx: 1.18, sy: 0.82 }, 70, out3, t)
    await to({ sx: 1, sy: 1 }, 460, spring, t)
    return
  }
  await tween(220, (u) => paint(three(14 * (1 - io(u)), 4.4 + 1.4 * io(u))), t)
  const K = 22
  const th0 = -Math.PI / 2
  const comet = (
    th: number,
    len: number,
    rad: number,
    r0: number,
    r1: number
  ) => {
    const L: number[][] = []
    for (let j = 0; j < K; j++) {
      const f = j / (K - 1)
      const a = th - len * f
      L.push([
        CX + rad * Math.cos(a),
        CY + rad * Math.sin(a),
        r0 + (r1 - r0) * f
      ])
    }
    return blobs(L, 3)
  }
  const turnA = 1.75 * Math.PI * 2
  const LEN = 1.55 * Math.PI
  await tween(
    950,
    (u) =>
      paint(
        comet(
          th0 + turnA * io(u),
          LEN * out3(Math.min(1, u * 2.2)),
          15 * out3(Math.min(1, u * 3.5)),
          5.8 - 1.4 * Math.min(1, u * 3),
          1.2
        )
      ),
    t
  )
  await tween(
    300,
    (u) => {
      const e = io(u)
      paint(
        comet(
          th0 + turnA + Math.PI * out3(u),
          LEN + (Math.PI * 2 - LEN) * e,
          15 + 4 * e,
          4.4 - 0.8 * e,
          1.2 + 2.4 * e
        )
      )
    },
    t
  )
  const ringF = (x: number, y: number) =>
    Math.abs(Math.hypot(x - CX, y - CY) - 19) - 3.6
  await Promise.all([
    tween(
      280,
      (u) => {
        const e = io(u)
        const b = 2 * Math.sin(Math.PI * u)
        paint((x, y, i) => {
          const r = ringF(x, y)
          return r + (sb[i] - r) * e - b
        })
      },
      t
    ),
    to({ sx: 0.9, sy: 1.14 }, 280, io, t),
    tween(280, (u) => (shade = 0.45 + 0.55 * io(u)), t)
  ])
  await finish()
  eye({ wide: 1 }, 420, spring, t)
  // Sorri só se achou: sem bares, a próxima cena é a do "?".
  if (next === 'done') setMood('happy', t)
  await to({ sx: 1, sy: 1 }, 520, spring, t)
}

// ---------- estados ----------
type Run = (t: number, prev: MascotState) => Promise<void>
const loopHop = async (t: number, every: number, h: number) => {
  while (alive(t) && !reduce) {
    await sleep(every)
    if (!alive(t)) return
    await hop(h, t)
  }
}
const home = (t: number) => morph(HOME, {}, t)
/** A taça de frente: troca de forma se precisar, sem soltar e virar de novo. */
const homeFront = async (t: number) => {
  if (cur === HOME) await front(t)
  else await morph(HOME, { stay: true }, t)
  // O sorriso de "pronto" não passa para a cena seguinte.
  if (E.happy > 0) await setMood('idle', t)
}

/** Salto com giro de verdade em 3D (a cambalhota do artifact). */
async function flip(t: number) {
  await release(t)
  await to({ sx: 1.18, sy: 0.78 }, 150, out3, t)
  await to({ sx: 0.94, sy: 1.1, y: -3 }, 70, out3, t)
  const h = 40
  const y0 = S.y
  await tween(
    640,
    (u) => {
      const air = Math.sin(Math.PI * u)
      S.y = y0 * (1 - u) - 4 * h * u * (1 - u)
      S.sx = 0.94 + 0.06 * u - 0.04 * air
      S.sy = 1.1 - 0.1 * u + 0.06 * air
      apply()
      bot.update({ view: { yaw: 0, pitch: -io(u) * Math.PI * 2 } })
    },
    t
  )
  bot.update({ view: { yaw: 0, pitch: 0 } })
  ripple(S.x)
  await to({ y: 0, sx: 1.2, sy: 0.8 }, 60, out3, t)
  await to({ sx: 1, sy: 1 }, 440, spring, t)
}

const STATES: Record<MascotState, Run> = {
  idle: async (t) => {
    await home(t)
    if (!alive(t)) return
    await setMood('idle', t)
    await release(t)
  },
  thinking: async (t) => {
    await home(t)
    if (!alive(t)) return
    await release(t)
    setMood('thinking', t)
    orbit.classList.add('on')
    await to({ sx: 0.56, sy: 0.56 }, 360, spring, t)
    await ponder(t)
  },
  live: async (t) => {
    await morph(DEF.telao, { stay: true }, t)
    if (!alive(t)) return
    live.classList.add('on')
    glow.classList.add('on')
    await sleep(250)
    await setMood('happy', t)
    await hop(12, t)
    await loopHop(t, 1800, 8)
  },
  searching: async (t) => {
    await morph(DEF.gota, { stay: true, quick: true }, t)
    if (reduce) {
      // Sem os pulos: os bares marcados aparecem de uma vez.
      pin(-72)
      pin(70)
      return
    }
    for (let i = 0; alive(t); i++) {
      const x = SPOTS[i % 3]
      if (i < 3 && i > 0) pin(SPOTS[i - 1])
      await jump(x, t, i % 3 === 2)
      if (!alive(t)) return
      if (i === 2) await sleep(500)
    }
  },
  comparing: async (t) => {
    await morph(DEF.gota, { stay: true, quick: true }, t)
    if (!alive(t)) return
    if (S.x !== 0) await jump(0, t, true)
    if (!alive(t)) return
    const have = new Set(pins().map((p) => Number(p.dataset.x)))
    for (const x of [-72, 70]) if (!have.has(x)) pin(x)
    pin(0)
    await to({ sx: 1.14, sy: 0.84 }, 90, out3, t)
    await to({ y: -46, sx: 0.96, sy: 1.06 }, 260, out3, t)
    if (!alive(t)) return
    to({ sx: 1, sy: 1 }, 300, spring, t)
    const find = (x: number) =>
      pins().find((p) => Number(p.dataset.x) === x) as HTMLElement
    const list = [-72, 0, 70].map(find)
    const nod = (el: HTMLElement) =>
      !reduce &&
      el.animate(
        [
          { translate: '0 0' },
          { translate: `0 ${-px(9)}px` },
          { translate: '0 0' }
        ],
        {
          duration: 240,
          easing: 'ease-out',
          composite: 'add'
        }
      )
    for (const [i, gx] of [
      [0, -1],
      [1, 0],
      [2, 1]
    ]) {
      await eye({ gx, gy: 0.9 }, 150, io, t)
      nod(list[i])
      await sleep(230)
      if (!alive(t)) return
    }
    const dx = 0.7 * B
    if (!reduce) {
      list[2].animate(
        [
          { translate: '0 0' },
          { translate: `${-dx / 2}px ${-px(26)}px` },
          { translate: `${-dx}px 0` }
        ],
        { duration: 420, easing: 'ease-in-out', fill: 'forwards' }
      )
      list[1].animate(
        [
          { translate: '0 0' },
          { translate: `${dx / 2}px ${px(12)}px` },
          { translate: `${dx}px 0` }
        ],
        { duration: 420, easing: 'ease-in-out', fill: 'forwards' }
      )
    }
    eye({ gx: 0.5 }, 200, io, t)
    await sleep(210)
    await eye({ gx: 0, gy: 0.9 }, 210, io, t)
    if (!alive(t)) return
    list[2].classList.add('best')
    for (const p of [list[0], list[1]])
      p.animate([{ opacity: 1 }, { opacity: 0.45 }], {
        duration: 300,
        fill: 'forwards'
      })
    await eye({ gy: 0.4, wide: 1.1 }, 200, out3, t)
    // fica olhando o melhor, flutuando
    while (alive(t) && !reduce) {
      await to({ y: -42 }, 900, io, t)
      await to({ y: -46 }, 900, io, t)
    }
  },
  writing: async (t) => {
    await writeIn(t)
  },
  done: async (t) => {
    if (cur !== HOME) await morph(HOME, { stay: true }, t)
    await setMood('happy', t)
    confetti()
    await sleep(500)
    await flip(t)
    await sleep(2600)
    if (!alive(t)) return
    bot.update({ mood: 'idle' })
    mood = 'idle'
  },
  empty: async (t) => {
    await homeFront(t)
    if (!alive(t)) return
    await to({ x: -8, r: -4 }, 220, io, t)
    await eye({ gx: -1 }, 160, out3, t)
    await sleep(320)
    to({ x: 8, r: 4 }, 320, io, t)
    await eye({ gx: 1 }, 220, io, t)
    await sleep(380)
    if (!alive(t)) return
    to({ x: 0, r: 0 }, 260, io, t)
    await eye({ gx: 0, gy: -0.9 }, 220, io, t)
    pop('txt big', 30, -56, '?')
    await sleep(650)
    if (!alive(t)) return
    eye({ gy: 0.5, tilt: 16, open: 0.8 }, 320, out3, t)
    await to({ sx: 1.07, sy: 0.9 }, 420, out3, t)
  },
  awaiting: async (t) => {
    await homeFront(t)
    if (!alive(t)) return
    await setMood('idle', t)
    for (let i = 0; alive(t) && !reduce; i++) {
      eye({ gy: 1, gx: 0, wide: 1 }, 180, io, t)
      await to({ r: 0, y: 2, sx: 1.04, sy: 0.95 }, 220, io, t)
      await sleep(380)
      if (!alive(t)) return
      eye({ gy: 0, wide: 1.14 }, 180, io, t)
      await to({ y: -5, sx: 0.97, sy: 1.05, r: i % 2 ? -4 : 4 }, 240, out3, t)
      await sleep(620)
      if (!alive(t)) return
      eye({ wide: 1 }, 200, out3, t)
      await to({ y: 0, sx: 1, sy: 1, r: 0 }, 300, spring, t)
      await sleep(250)
    }
  },
  going: async (t) => {
    await morph(DEF.ingresso, { stay: true }, t)
    if (!alive(t)) return
    await sleep(250)
    eye({ gx: 0.8, gy: 0.5 }, 160, out3, t)
    await stamp.animate(
      [
        {
          transform: 'translate(-50%,-50%) rotate(-14deg) scale(2.6)',
          opacity: 0
        },
        {
          transform: 'translate(-50%,-50%) rotate(-14deg) scale(1)',
          opacity: 1
        }
      ],
      {
        duration: reduce ? 1 : 150,
        easing: 'cubic-bezier(.6,0,1,.6)',
        fill: 'forwards'
      }
    ).finished
    if (!alive(t)) return
    burst(23, 14, 10, [LIVE], { spread: 50, size: [4, 8] })
    wince(t)
    await to({ sx: 1.1, sy: 0.88, r: 2 }, 60, out3, t)
    await to({ sx: 1, sy: 1, r: 0 }, 420, spring, t)
    eye({ gx: 0, gy: 0 }, 200, out3, t)
    await setMood('happy', t)
    await sleep(1500)
    if (!alive(t)) return
    hideStamp()
    await home(t)
  },
  call: async (t) => {
    await morph(DEF.megafone, { stay: true }, t)
    if (!alive(t)) return
    await eye({ gx: 1 }, 160, out3, t)
    for (let k = 0; k < 3; k++) {
      await to({ sx: 0.93, sy: 1.06, r: 3 }, 90, out3, t)
      for (let i = 0; i < 3; i++) wave(i)
      eye({ open: 0.08 }, 60, out3, t)
      await to({ sx: 1.12, sy: 0.93, r: -6, x: -3 }, 80, out3, t)
      eye({ open: 1 }, 260, spring, t)
      await to({ sx: 1, sy: 1, r: 0, x: 0 }, 330, spring, t)
      if (!alive(t)) return
    }
    eye({ gx: 0 }, 200, out3, t)
    await setMood('happy', t)
    await sleep(1100)
    if (!alive(t)) return
    await home(t)
  },
  remind: async (t) => {
    await morph(DEF.sino, { stay: true }, t)
    if (!alive(t)) return
    wrap.style.transformOrigin = '50% 14%'
    let k = 0
    for (const r of [17, -15, 12, -10, 7, -4, 0]) {
      if (r) {
        for (let i = 0; i < 2; i++) wave(i, r > 0 ? -42 : 42, 8, r > 0 ? -1 : 1)
        eye({ open: k++ % 2 ? 1 : 0.15, gx: r > 0 ? -0.6 : 0.6 }, 90, out3, t)
      }
      await to({ r }, 150, io, t)
      if (!alive(t)) return
    }
    wrap.style.transformOrigin = ''
    eye({ open: 1, gx: 0 }, 160, out3, t)
    const chip = pop('chip', 34, -50, '3 h antes')
    await setMood('happy', t)
    await hop(8, t)
    await sleep(1200)
    if (!alive(t)) return
    fade(chip)
    await home(t)
  },
  refused: async (t) => {
    await morph(DEF.apito, { stay: true }, t)
    if (!alive(t)) return
    await sleep(200)
    await to({ sx: 0.92, sy: 1.08 }, 120, out3, t)
    eye({ open: 0.1 }, 60, out3, t)
    for (let i = 0; i < 3; i++) wave(i, 44, 4)
    await to({ sx: 1.14, sy: 0.9, x: -3 }, 80, out3, t)
    await to({ sx: 1, sy: 1, x: 0 }, 380, spring, t)
    eye({ open: 1, gx: -0.7, gy: -0.7 }, 200, out3, t)
    pop('card', -40, -46)
    await sleep(300)
    if (!alive(t)) return
    await eye({ tilt: 12 }, 260, out3, t)
  },
  stopped: async (t) => {
    await homeFront(t)
    if (!alive(t)) return
    await to({ sy: 0.93, sx: 1.04 }, 140, io, t)
    await to({ sy: 1, sx: 1 }, 300, spring, t)
    await sleep(700)
    await release(t)
  },
  limit: async (t) => {
    await homeFront(t)
    if (!alive(t)) return
    eye({ open: 0.55 }, 400, io, t)
    await to({ sx: 0.95, sy: 1.1, y: -2 }, 520, io, t)
    eye({ open: 0.1 }, 300, io, t)
    await to({ sx: 1.06, sy: 0.93, y: 0 }, 420, io, t)
    if (!alive(t)) return
    eye({ flat: 1 }, 260, out3, t)
    await to({ r: 7, x: 3 }, 600, io, t)
    while (alive(t) && !reduce) {
      zzz(3)
      for (let i = 0; i < 2 && alive(t); i++) {
        await to({ sy: 0.98, sx: 1.03 }, 700, io, t)
        await to({ sy: 0.93, sx: 1.06 }, 700, io, t)
      }
    }
  },
  down: async (t) => {
    await homeFront(t)
    if (!alive(t)) return
    eye({ wide: 1.25 }, 60, out3, t)
    for (const x of [-7, 7, -6, 5, -3, 0])
      await to({ x, r: x * 0.6 }, 45, lin, t)
    await eye({ dead: 1, wide: 1 }, 320, lin, t)
    if (!alive(t)) return
    pop('dizzy', 0, -44, '<i></i><i></i><i></i>')
    while (alive(t) && !reduce) {
      await to({ r: 8, x: 3, sy: 0.97 }, 480, io, t)
      await to({ r: -8, x: -3, sy: 0.97 }, 480, io, t)
    }
  },
  offline: async (t) => {
    await homeFront(t)
    if (!alive(t)) return
    const sig = pop('sig', 0, -62, '<b></b><b></b><b></b><u></u>')
    eye({ gy: -1, wide: 1.1 }, 200, out3, t)
    await sleep(500)
    for (const b of [...sig.querySelectorAll('b')].reverse()) {
      ;(b as HTMLElement).style.opacity = '.18'
      await to({ sy: S.sy - 0.025, sx: S.sx + 0.015 }, 160, out3, t)
      await sleep(170)
      if (!alive(t)) return
    }
    ;(sig.querySelector('u') as HTMLElement).style.transform =
      'rotate(-45deg) scaleX(1)'
    eye({ gy: 0.3, wide: 1, tilt: 13, open: 0.7 }, 300, out3, t)
    // marcado antes: se o próximo estado chegar no meio, a cor volta igual
    grey = true
    await tint(theme().rgb, GREY, 520, t)
  }
}
let grey = false
function hideStamp() {
  for (const a of stamp.getAnimations()) a.cancel()
}

/**
 * Tira da tela o que é de outro estado (enfeites, cor, giro) antes do próximo
 * entrar. O que tem saída própria (pensando encolhida, escrevendo) sai aqui
 * com movimento; o resto some rápido.
 */
async function leave(prev: MascotState, next: MascotState, t: number) {
  orbit.classList.remove('on')
  live.classList.remove('on')
  glow.classList.remove('on')
  hideStamp()
  wrap.style.transformOrigin = ''
  for (const el of fx.querySelectorAll('i')) {
    const keepPins =
      el.classList.contains('pin') &&
      (next === 'comparing' || (prev === 'searching' && next === 'searching'))
    if (!keepPins) fade(el)
  }
  bot.update({ view: { yaw: 0, pitch: 0 } })
  if (grey) {
    grey = false
    await tint(GREY, theme().rgb, 260, t)
    bot.update({
      color: theme().body,
      eyeColor: frontal ? theme().body : theme().eye
    })
  }
  if (E.dead || E.flat || E.tilt || E.wk) eye(NEUTRAL, 260, out3, t)
  if (writing) await writeOut(t, next)
  if (!alive(t)) return
  if (prev === 'thinking' && S.sx < 0.9) {
    setMood('idle', t)
    await to({ sx: 1, sy: 1 }, 520, spring, t)
  } else if (S.x || S.y || S.r || S.sx !== 1 || S.sy !== 1) {
    await to({ x: 0, y: 0, r: 0, sx: 1, sy: 1 }, 320, io, t)
  }
  if (prev === 'offline' && next === 'idle') {
    await setMood('happy', t)
    await hop(12, t)
  }
}

let shown: MascotState = 'idle'
async function go(next: MascotState) {
  const prev = shown
  shown = next
  const t = ++token
  try {
    await leave(prev, next, t)
    await STATES[next](t, prev)
  } catch (e) {
    if (e !== CANCEL) throw e
  }
}

/**
 * Cada cena fica um mínimo na tela antes da próxima: o chat às vezes manda
 * dois passos em menos de um segundo, e o telão sumiria antes de aparecer.
 * Erros, "parou" e a falta de rede passam na frente.
 */
const DWELL: Partial<Record<MascotState, number>> = {
  thinking: 900,
  live: 1700,
  searching: 2300,
  comparing: 2400,
  writing: 1400,
  awaiting: 600
}
const URGENT = new Set<MascotState>(['stopped', 'offline', 'limit', 'down'])
let wanted: MascotState = 'idle'
let since = 0
let later: ReturnType<typeof setTimeout> | undefined
function request(next: MascotState) {
  wanted = next
  clearTimeout(later)
  const wait = since + (DWELL[shown] ?? 0) - performance.now()
  if (wait > 0 && !URGENT.has(next)) {
    later = setTimeout(() => request(next), wait)
    return
  }
  since = performance.now()
  if (next !== shown) go(next)
}

window.setMascot = (c) => {
  const before = cfg
  cfg = { ...cfg, ...c }
  if (cfg.reduced !== before.reduced) {
    reduce = cfg.reduced
    document.documentElement.classList.toggle('reduce', reduce)
    bot.update({ reducedMotion: reduce })
  }
  if (cfg.dark !== before.dark) {
    fit()
    bodyRgb = theme().rgb
    bot.update({
      color: theme().body,
      eyeColor: frontal ? theme().body : theme().eye
    })
  }
  if (cfg.state !== wanted) request(cfg.state)
}

requestAnimationFrame(() => {
  apply()
  window.ReactNativeWebView?.postMessage('ready')
  // As formas de antes, uma por vez no tempo livre: na hora da troca, calcular
  // o campo de distância perdia quadros bem no impulso.
  const queue = Object.values(DEF)
  const warm = () => {
    const def = queue.shift()
    if (!def) return
    sdf(def)
    setTimeout(warm, 60)
  }
  setTimeout(warm, 400)
  if (cfg.state !== 'idle') request(cfg.state)
})
