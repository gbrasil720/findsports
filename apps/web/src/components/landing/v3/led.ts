/*
 * Telão de LED da landing (WEB-501, DESIGN.md "Telão de LED"): uma foto reduzida
 * a uma grade de quadrados em papel sobre tinta; TV e gramado acendem em acid.
 * Pisca devagar, uma faixa de luz desce e acende perto do ponteiro. Só anima
 * na tela e nunca com movimento reduzido. As grades (`/landing/v3/led.json`)
 * saem de `docs/design/redesign-2026-11/landing` e ficam fora do bundle.
 */

type Grid = { c: number; r: number; l: string; f: string }
type Grids = Record<string, Grid>

const LEVELS = 10
const FRAME_MS = 33

function decode(base64: string) {
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

class Led {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cols: number
  private rows: number
  private lum: Uint8Array
  private flag: Uint8Array
  private soft: boolean
  private phase: Float32Array
  private speed: Float32Array
  private start = performance.now()
  private mx = -9999
  private my = -9999
  private w = 0
  private h = 0
  private pitch = 6
  private ox = 0
  private oy = 0
  visible = false

  constructor(canvas: HTMLCanvasElement, grid: Grid) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    this.cols = grid.c
    this.rows = grid.r
    this.lum = decode(grid.l)
    this.flag = decode(grid.f)
    this.soft = canvas.dataset.mode === 'soft'
    const n = this.cols * this.rows
    this.phase = new Float32Array(n)
    this.speed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      this.phase[i] = Math.random() * 6.28
      this.speed[i] = Math.random() < 0.18 ? 1.6 + Math.random() * 2.4 : 0
    }
    this.size()
  }

  pointer(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect()
    this.mx = x - rect.left
    this.my = y - rect.top
  }

  leave() {
    this.mx = -9999
    this.my = -9999
  }

  size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = this.w * dpr
    this.canvas.height = this.h * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.pitch = Math.max(Math.max(this.w / this.cols, this.h / this.rows), 5.5)
    this.ox = (this.w - this.cols * this.pitch) / 2
    this.oy = (this.h - this.rows * this.pitch) / 2
  }

  draw(now: number) {
    const { ctx, cols, rows, pitch } = this
    const t = (now - this.start) / 1000
    const side = pitch * 0.78
    const pad = (pitch - side) / 2
    ctx.clearRect(0, 0, this.w, this.h)
    const plain: number[][] = []
    const lit: number[][] = []
    for (let q = 0; q < LEVELS; q++) {
      plain.push([])
      lit.push([])
    }
    const scan = (((t * 0.12) % 1.4) - 0.2) * this.h
    const reach = 150 * 150
    for (let j = 0; j < rows; j++) {
      const y = this.oy + j * pitch
      if (y < -pitch || y > this.h) continue
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        const x = this.ox + i * pitch
        if (x < -pitch || x > this.w) continue
        let v = (this.lum[k] as number) / 255
        v = v ** 0.9
        if (this.speed[k])
          v *=
            0.75 +
            0.25 *
              Math.sin(
                t * (this.speed[k] as number) + (this.phase[k] as number)
              )
        const dy = y - scan
        if (dy > -60 && dy < 60) v += 0.18 * (1 - Math.abs(dy) / 60)
        const dx = x - this.mx
        const dd = dx * dx + (y - this.my) * (y - this.my)
        if (dd < reach) v += 0.45 * (1 - dd / reach)
        if (this.soft) v *= 0.72
        const level = Math.min(LEVELS - 1, Math.floor(v * LEVELS))
        if (level < 1) continue
        ;(this.flag[k] || v > 0.93 ? lit : plain)[level]?.push(x + pad, y + pad)
      }
    }
    for (let q = 1; q < LEVELS; q++) {
      const a = q / (LEVELS - 1)
      const batches: [number[] | undefined, string][] = [
        [plain[q], `rgba(241,238,230,${(a * 0.82).toFixed(3)})`],
        [lit[q], `rgba(201,241,53,${Math.min(1, a * 1.05 + 0.1).toFixed(3)})`]
      ]
      for (const [points, color] of batches) {
        if (!points?.length) continue
        ctx.fillStyle = color
        ctx.beginPath()
        for (let m = 0; m < points.length; m += 2)
          ctx.rect(points[m] as number, points[m + 1] as number, side, side)
        ctx.fill()
      }
    }
  }
}

/** Liga os `canvas[data-led]` dentro de `root`. Devolve a limpeza. */
export function startLeds(root: HTMLElement): () => void {
  const canvases = [
    ...root.querySelectorAll<HTMLCanvasElement>('canvas[data-led]')
  ]
  if (!canvases.length) return () => {}
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let leds: Led[] = []
  let raf = 0
  let last = 0
  let stopped = false
  const cleanups: (() => void)[] = []

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (now - last < FRAME_MS) return
    last = now
    for (const led of leds) if (led.visible) led.draw(now)
  }

  fetch('/landing/v3/led.json')
    .then((response) => response.json() as Promise<Grids>)
    .then((grids) => {
      if (stopped) return
      leds = canvases.flatMap((canvas) => {
        const grid = grids[canvas.dataset.led ?? '']
        return grid ? [new Led(canvas, grid)] : []
      })
      for (const led of leds) {
        const host = led.canvas.parentElement
        if (!host) continue
        const move = (e: PointerEvent) => led.pointer(e.clientX, e.clientY)
        const leave = () => led.leave()
        host.addEventListener('pointermove', move)
        host.addEventListener('pointerleave', leave)
        cleanups.push(() => {
          host.removeEventListener('pointermove', move)
          host.removeEventListener('pointerleave', leave)
        })
        led.draw(performance.now())
      }
      if (reduce) return
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const led = leds.find((l) => l.canvas === entry.target)
          if (led) led.visible = entry.isIntersecting
        }
      })
      for (const led of leds) io.observe(led.canvas)
      cleanups.push(() => io.disconnect())
      raf = requestAnimationFrame(loop)
    })
    .catch(() => {
      // Sem a grade, o fundo de tinta continua: o telão é enfeite.
    })

  let resizeTimer = 0
  const onResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      for (const led of leds) {
        led.size()
        led.draw(performance.now())
      }
    }, 120)
  }
  window.addEventListener('resize', onResize)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    clearTimeout(resizeTimer)
    window.removeEventListener('resize', onResize)
    for (const cleanup of cleanups) cleanup()
  }
}
