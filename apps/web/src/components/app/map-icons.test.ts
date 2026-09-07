import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

import {
  aplicarPino,
  criarConteudoDePino,
  criarPontoDoUsuario
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

    aplicarPino(pintura, 'ink', true)
    // Simula o que o MapLibre faz a cada quadro.
    raiz.style.transform = 'translate(-50%, -100%) translate(10px, 20px)'
    expect(pintura.style.transform).toMatch(/^scale\(/)
  })

  test('a cor entra pela variável CSS que o SVG consome', () => {
    const { raiz, pintura } = criarConteudoDePino()

    aplicarPino(pintura, 'live', false)
    expect(pintura.style.getPropertyValue('--pino-cor')).toBe('#E8320C')

    aplicarPino(pintura, 'acid', false)
    expect(pintura.style.getPropertyValue('--pino-cor')).toBe('#C9F135')

    expect(raiz.querySelector('path')?.getAttribute('fill')).toBe(
      'var(--pino-cor)'
    )
  })

  test('o destaque escala e volta', () => {
    const { pintura } = criarConteudoDePino()

    aplicarPino(pintura, 'ink', true)
    expect(pintura.style.transform).toMatch(/^scale\(/)

    aplicarPino(pintura, 'ink', false)
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

    aplicarPino(pintura, 'acid', false)
    aplicarPino(pintura, 'acid', true)
    aplicarPino(pintura, 'live', false)

    expect(raiz.querySelector('svg')).toBe(svgAntes)
    expect(raiz.querySelectorAll('svg')).toHaveLength(1)
    expect(raiz.querySelector('filter')).toBeNull()
    expect(pintura.style.filter).toContain('drop-shadow')
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
