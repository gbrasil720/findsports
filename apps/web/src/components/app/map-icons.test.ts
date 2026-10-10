import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

import {
  aplicarPino,
  criarConteudoDePino,
  criarPontoDoUsuario,
  type MapPin,
  ordemDoPino,
  pinDoPlano
} from './map-icons'

let dom: JSDOM

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  Object.defineProperty(globalThis, 'document', {
    value: dom.window.document,
    configurable: true
  })
})

afterEach(() => {
  dom.window.close()
})

describe('pinos do mapa (ESC-16, WEB-73)', () => {
  /**
   * A troca de `google.maps.Icon` por DOM tem uma armadilha que o tipo não
   * pega: nó do DOM só existe em um lugar. Se dois marcadores recebessem o
   * mesmo elemento, o segundo o arrancaria do primeiro e um pino sumiria do
   * mapa — sem erro nenhum.
   */
  test('cada marcador recebe o seu próprio elemento', () => {
    const a = criarConteudoDePino()
    const b = criarConteudoDePino()
    expect(a.raiz).not.toBe(b.raiz)
    expect(a.pintura).not.toBe(b.pintura)
    expect(a.raiz.querySelectorAll('svg')).toHaveLength(1)
  })

  /**
   * Ponteiro é promessa de que clicar leva a algum lugar. Na página pública do
   * bar o mapa é decorativo (`aria-hidden`, sem `onSelect`), então quem
   * escreve o cursor é o componente, não o ícone.
   */
  test('o pino nasce sem cursor de ponteiro', () => {
    expect(criarConteudoDePino().raiz.style.cursor).toBe('')
  })

  /**
   * Delta 2 do WEB-73: o `maplibregl.Marker` reescreve `transform` e
   * `opacity` da raiz a cada quadro, para posicionar. Pintar na raiz faria o
   * destaque do hover ser apagado no quadro seguinte, sem erro nenhum.
   */
  test('a pintura fica num nó filho, longe do transform do MapLibre', () => {
    const { raiz, pintura } = criarConteudoDePino()
    expect(pintura.parentElement).toBe(raiz)
    expect(raiz.style.transform).toBe('')

    aplicarPino(pintura, 'starter', true)
    // Simula o que o MapLibre faz a cada quadro.
    raiz.style.transform = 'translate(-50%, -100%) translate(10px, 20px)'
    expect(pintura.style.transform).toMatch(/^scale\(/)
  })

  test('a cor entra pela variável CSS que o SVG consome', () => {
    const { raiz, pintura } = criarConteudoDePino()

    aplicarPino(pintura, 'live', false)
    expect(pintura.style.getPropertyValue('--pino-cor')).toBe('#E8320C')

    aplicarPino(pintura, 'elite', false)
    expect(pintura.style.getPropertyValue('--pino-cor')).toBe('#C9F135')

    expect(raiz.querySelector('path')?.getAttribute('fill')).toBe(
      'var(--pino-cor)'
    )
  })

  test('o destaque escala e volta', () => {
    const { pintura } = criarConteudoDePino()

    aplicarPino(pintura, 'starter', true)
    expect(pintura.style.transform).toMatch(/^scale\(/)

    aplicarPino(pintura, 'starter', false)
    expect(pintura.style.transform).toBe('')
  })

  /**
   * O pino cresce a partir da ponta, que é o ponto ancorado na coordenada.
   * Com a origem no centro, o destaque afastaria a ponta do endereço real.
   */
  test('o destaque cresce a partir da ponta', () => {
    expect(criarConteudoDePino().pintura.style.transformOrigin).toBe(
      'bottom center'
    )
  })

  /**
   * O caminho do hover não pode reanalisar marcação. Trinta pinos no mesmo
   * documento também não podem repetir `id` de filtro SVG — daí a sombra ser
   * do CSS, e não um `<filter>` interno.
   */
  test('reaplicar não recria nós, e não há filtro com id repetido', () => {
    const { raiz, pintura } = criarConteudoDePino()
    const svgAntes = raiz.querySelector('svg')

    aplicarPino(pintura, 'pro', false)
    aplicarPino(pintura, 'elite', true)
    aplicarPino(pintura, 'live', false)

    expect(raiz.querySelector('svg')).toBe(svgAntes)
    expect(raiz.querySelectorAll('svg')).toHaveLength(1)
    expect(raiz.querySelector('filter')).toBeNull()
    expect(pintura.style.filter).toContain('drop-shadow')
  })

  /**
   * WEB-332: cada plano tem o seu pino, sem cor nova. O corpo, o miolo e a
   * estrela leem uma variável cada; `none` apaga a peça que o pino não usa.
   */
  test('cada plano e o jogo ao vivo pintam o seu pino', () => {
    const { raiz, pintura } = criarConteudoDePino()
    const INK = '#12120F'
    const ACID = '#C9F135'
    const LIVE = '#E8320C'
    const CREME = '#F1EEE6'
    const esperado: Record<MapPin, [string, string, string]> = {
      starter: [INK, CREME, 'none'],
      pro: [INK, ACID, 'none'],
      elite: [ACID, 'none', INK],
      live: [LIVE, CREME, 'none'],
      'elite-live': [LIVE, 'none', INK]
    }

    for (const [pin, cores] of Object.entries(esperado)) {
      aplicarPino(pintura, pin as MapPin, false)
      expect(
        ['--pino-cor', '--pino-miolo', '--pino-estrela'].map((nome) =>
          pintura.style.getPropertyValue(nome)
        )
      ).toEqual(cores)
    }

    expect(raiz.querySelector('circle')?.getAttribute('fill')).toBe(
      'var(--pino-miolo)'
    )
    expect(raiz.querySelectorAll('path')[1]?.getAttribute('fill')).toBe(
      'var(--pino-estrela)'
    )
  })

  test('o plano escolhe o pino, e o jogo ao vivo não apaga a estrela do Elite', () => {
    expect(pinDoPlano('starter')).toBe('starter')
    expect(pinDoPlano(null)).toBe('starter')
    expect(pinDoPlano('pro')).toBe('pro')
    expect(pinDoPlano('elite')).toBe('elite')
    expect(pinDoPlano('starter', true)).toBe('live')
    expect(pinDoPlano('pro', true)).toBe('live')
    expect(pinDoPlano('elite', true)).toBe('elite-live')
  })

  test('o Elite fica por cima dos outros planos, e o destaque, por cima de todos', () => {
    const ordem = (pin: MapPin, large = false) =>
      Number(ordemDoPino(pin, large))

    for (const elite of ['elite', 'elite-live'] as const) {
      for (const outro of ['starter', 'pro', 'live'] as const) {
        expect(ordem(elite)).toBeGreaterThan(ordem(outro))
        expect(ordem(outro, true)).toBeGreaterThan(ordem(elite))
      }
    }
  })

  /**
   * O ponto do usuário marca uma posição exata. Com `anchor: 'center'` no
   * `maplibregl.Marker` ele fica centrado nela sem compensação em CSS — o
   * `translateY(50%)` que existia aqui era só para desfazer a âncora de base
   * do marcador do Google.
   */
  test('o ponto do usuário não carrega compensação de âncora', () => {
    expect(criarPontoDoUsuario().style.transform).toBe('')
  })
})
