import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

import {
  aplicarPino,
  criarConteudoDePino,
  criarPontoDoUsuario
} from './google-map-icons'

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

describe('pinos do mapa (ESC-16)', () => {
  /**
   * A troca de `google.maps.Icon` por DOM tem uma armadilha que o tipo não
   * pega: nó do DOM só existe em um lugar. Se dois marcadores recebessem o
   * mesmo elemento, o segundo o arrancaria do primeiro e um pino sumiria do
   * mapa — sem erro nenhum.
   */
  test('cada marcador recebe o seu próprio elemento', () => {
    const a = criarConteudoDePino()
    const b = criarConteudoDePino()
    expect(a).not.toBe(b)
    expect(a.querySelectorAll('svg')).toHaveLength(1)
  })

  test('a cor entra pela variável CSS que o SVG consome', () => {
    const elemento = criarConteudoDePino()

    aplicarPino(elemento, 'live', false)
    expect(elemento.style.getPropertyValue('--pino-cor')).toBe('#E8320C')

    aplicarPino(elemento, 'acid', false)
    expect(elemento.style.getPropertyValue('--pino-cor')).toBe('#C9F135')

    expect(elemento.querySelector('path')?.getAttribute('fill')).toBe(
      'var(--pino-cor)'
    )
  })

  test('o destaque escala e volta', () => {
    const elemento = criarConteudoDePino()

    aplicarPino(elemento, 'ink', true)
    expect(elemento.style.transform).toMatch(/^scale\(/)

    aplicarPino(elemento, 'ink', false)
    expect(elemento.style.transform).toBe('')
  })

  /**
   * O pino cresce a partir da ponta, que é o ponto ancorado na coordenada.
   * Com a origem no centro, o destaque afastaria a ponta do endereço real.
   */
  test('o destaque cresce a partir da ponta', () => {
    expect(criarConteudoDePino().style.transformOrigin).toBe('bottom center')
  })

  /**
   * O caminho do hover não pode reanalisar marcação. Trinta pinos no mesmo
   * documento também não podem repetir `id` de filtro SVG — daí a sombra ser
   * do CSS, e não um `<filter>` interno.
   */
  test('reaplicar não recria nós, e não há filtro com id repetido', () => {
    const elemento = criarConteudoDePino()
    const svgAntes = elemento.querySelector('svg')

    aplicarPino(elemento, 'acid', false)
    aplicarPino(elemento, 'acid', true)
    aplicarPino(elemento, 'live', false)

    expect(elemento.querySelector('svg')).toBe(svgAntes)
    expect(elemento.querySelectorAll('svg')).toHaveLength(1)
    expect(elemento.querySelector('filter')).toBeNull()
    expect(elemento.style.filter).toContain('drop-shadow')
  })

  /**
   * `AdvancedMarkerElement` ancora pela base. O ponto do usuário marca uma
   * posição exata e precisa ficar centrado nela, não apoiado sobre ela.
   */
  test('o ponto do usuário compensa a âncora da base', () => {
    const elemento = criarPontoDoUsuario()
    expect(elemento.style.transform).toBe('translateY(50%)')
  })
})
