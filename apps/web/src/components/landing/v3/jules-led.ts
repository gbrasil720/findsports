import { TACA_SVG } from '@/components/jules/taca-still'
import { analytics } from '@/lib/analytics'
import type { Led, LedSprite } from './led'

/*
 * Easter egg do telão de LED (WEB-556, desenho aprovado pelo dono em
 * 14/11/2026): de tempos em tempos, e sempre que a pessoa clica três vezes
 * no telão, a taça do Jules entra pela direita pulando, para no meio, pisca e
 * sai pela esquerda, desenhada nos mesmos pontos (corpo aceso em acid, olhos
 * apagados). É a taça parada (`taca-still.ts`), não o Jules animado. Só
 * carrega depois da página (`led.ts`) e nunca com movimento reduzido.
 */

/** Altura da taça como fração da parte do telão à vista. */
const ALTURA = 0.5
/** Um intervalo sorteado entre 1 e 2 min de página aberta (proposta). */
const ESPERA_MIN_MS = 60_000
const ESPERA_MAX_MS = 120_000
/** Os três cliques precisam caber nessa janela. */
const TRIPLO_MS = 700

const ENTRADA_MS = 1600
const PARADO_MS = 1400
const SAIDA_MS = 1400
const PISCADA_MS = 160

/** A taça em pontos: 1 corpo, 2 olho, 0 nada. */
async function rasterizar(lado: number): Promise<Uint8Array> {
  const img = new Image()
  // Sem largura e altura o SVG não tem tamanho natural (0 no Chromium).
  const svg = TACA_SVG.replace('<svg ', '<svg width="400" height="400" ')
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = lado
  canvas.height = lado
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return new Uint8Array(lado * lado)
  // O desenho ocupa ~14..86 do viewBox de 100: recorta a borda vazia.
  const corte = 0.12 * img.naturalWidth
  ctx.drawImage(
    img,
    corte,
    corte,
    img.naturalWidth - 2 * corte,
    img.naturalHeight - 2 * corte,
    0,
    0,
    lado,
    lado
  )
  const { data } = ctx.getImageData(0, 0, lado, lado)
  const mask = new Uint8Array(lado * lado)
  for (let k = 0; k < mask.length; k++) {
    if ((data[k * 4 + 3] as number) < 128) continue
    // Corpo acid (verde alto) ou olho tinta (escuro).
    mask[k] = (data[k * 4 + 1] as number) > 120 ? 1 : 2
  }
  return mask
}

const suave = (t: number) => t * t * (3 - 2 * t)

/** Liga o easter egg nos telões. Devolve a limpeza. */
export function startJulesLed(leds: Led[]): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  let parado = false
  let raf = 0
  let timer = 0
  let passando = false
  const limpezas: (() => void)[] = []

  const passar = async (led: Led) => {
    if (passando) return
    passando = true
    // O telão pode passar da tela (o herói é mais alto que ela): a taça se
    // mede e se centra pela parte que está à vista.
    const rect = led.canvas.getBoundingClientRect()
    const alto = Math.max(
      0,
      Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)
    )
    const lado = Math.max(12, Math.round((alto * ALTURA) / led.cell))
    const mask = await rasterizar(lado)
    const olhos = mask.map((v) => (v === 2 ? 1 : v))
    const centro = led.cellAt(
      rect.width / 2,
      Math.max(0, -rect.top) + alto * 0.5
    )
    const sprite: LedSprite = { mask, w: lado, h: lado, x: led.cols, y: 0 }
    const chao = Math.round(centro.j - lado / 2)
    const meio = centro.i - lado / 2
    const inicio = performance.now()
    const total = ENTRADA_MS + PARADO_MS + SAIDA_MS
    const quadro = (agora: number) => {
      if (parado) return
      const t = agora - inicio
      if (t >= total) {
        led.sprite = null
        passando = false
        return
      }
      if (t < ENTRADA_MS) {
        const p = t / ENTRADA_MS
        sprite.x = led.cols + (meio - led.cols) * suave(p)
        // Três pulinhos até parar.
        sprite.y = chao - Math.abs(Math.sin(p * Math.PI * 3)) * lado * 0.12
      } else if (t < ENTRADA_MS + PARADO_MS) {
        sprite.x = meio
        sprite.y = chao
        const dentro = t - ENTRADA_MS - PARADO_MS / 2
        sprite.mask = dentro > 0 && dentro < PISCADA_MS ? olhos : mask
      } else {
        const p = (t - ENTRADA_MS - PARADO_MS) / SAIDA_MS
        sprite.mask = mask
        sprite.x = meio + (-lado - meio) * suave(p)
        sprite.y = chao - Math.abs(Math.sin(p * Math.PI * 2)) * lado * 0.12
      }
      led.sprite = sprite
      raf = requestAnimationFrame(quadro)
    }
    raf = requestAnimationFrame(quadro)
  }

  const visivel = () => leds.find((led) => led.visible)

  // De tempos em tempos, com a página à vista e o telão na tela.
  const agendar = () => {
    const espera =
      ESPERA_MIN_MS + Math.random() * (ESPERA_MAX_MS - ESPERA_MIN_MS)
    timer = window.setTimeout(() => {
      const led = visivel()
      if (led && document.visibilityState === 'visible') void passar(led)
      agendar()
    }, espera)
  }
  agendar()

  // Três cliques no telão.
  for (const led of leds) {
    const host = led.canvas.parentElement
    if (!host) continue
    let cliques: number[] = []
    const clicar = (e: MouseEvent) => {
      // Clique num botão ou link do herói não conta.
      if ((e.target as Element | null)?.closest('a, button')) return
      const agora = performance.now()
      cliques = [...cliques.filter((c) => agora - c < TRIPLO_MS), agora]
      if (cliques.length < 3) return
      cliques = []
      if (passando) return
      analytics.julesFound('telao')
      void passar(led)
    }
    host.addEventListener('click', clicar)
    limpezas.push(() => host.removeEventListener('click', clicar))
  }

  return () => {
    parado = true
    cancelAnimationFrame(raf)
    clearTimeout(timer)
    for (const led of leds) led.sprite = null
    for (const limpar of limpezas) limpar()
  }
}
