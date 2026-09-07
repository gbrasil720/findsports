import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'

import { criarEstiloDoMapa } from './map-style'

const TILES = 'https://exemplo.blob.vercel-storage.com/maps/onside.pmtiles'
const ORIGEM = 'https://www.onside.sh'
const estilo = criarEstiloDoMapa(TILES, ORIGEM)

/** `apps/web/public`, onde os glyphs e o sprite são servidos. */
const PUBLIC_DIR = path.join(import.meta.dir, '..', '..', 'public')

describe('estilo do mapa (WEB-73)', () => {
  /**
   * O estilo é gerado, não escrito à mão: um campo errado no flavor vira uma
   * camada inválida que o MapLibre recusa em silêncio, e o defeito só
   * aparece como "o mapa está sem ruas" no navegador de outra pessoa.
   */
  it('passa na validação do spec do MapLibre', () => {
    expect(validateStyleMin(estilo).map((erro) => erro.message)).toEqual([])
  })

  it('aponta para o arquivo PMTiles pelo protocolo do pmtiles', () => {
    const fonte = estilo.sources.protomaps
    expect(fonte).toMatchObject({ type: 'vector', url: `pmtiles://${TILES}` })
  })

  /**
   * Delta 3: sem endpoint de glyphs o mapa não renderiza texto nenhum — nem
   * nome de rua, nem de bairro — e não há erro que aponte para a causa.
   * Estes arquivos são servidos de `public/`, então a existência em disco é
   * exatamente a garantia que importa.
   */
  it('serve todas as faixas de glyph que as camadas pedem', () => {
    const fontstacks = new Set<string>()
    for (const camada of estilo.layers) {
      if (camada.type !== 'symbol') continue
      // `text-font` é ora um array literal, ora uma expressão `case` com
      // `["literal", ["Noto Sans Medium"]]` dentro. Varrer a estrutura inteira
      // pega os dois sem depender do formato.
      const procurar = (valor: unknown) => {
        if (typeof valor === 'string' && valor.startsWith('Noto Sans')) {
          fontstacks.add(valor)
          return
        }
        if (Array.isArray(valor)) for (const item of valor) procurar(item)
      }
      procurar(camada.layout?.['text-font'])
    }

    expect(fontstacks.size).toBeGreaterThan(0)
    for (const stack of fontstacks) {
      for (const faixa of ['0-255', '256-511', '7680-7935', '8192-8447']) {
        const arquivo = path.join(
          PUBLIC_DIR,
          'map',
          'fonts',
          stack,
          `${faixa}.pbf`
        )
        expect({ stack, faixa, existe: existsSync(arquivo) }).toEqual({
          stack,
          faixa,
          existe: true
        })
      }
    }
  })

  /**
   * O MapLibre recusa `sprite` relativo com `must be absolute` e sequer
   * carrega o estilo — o mapa fica para sempre em "Carregando mapa…", sem
   * cartão de erro. O mesmo vale para `glyphs`.
   */
  it('serve o sprite que as camadas de ícone pedem, em URL absoluta', () => {
    expect(estilo.sprite).toBe(`${ORIGEM}/map/sprite/light`)
    expect(estilo.glyphs).toBe(`${ORIGEM}/map/fonts/{fontstack}/{range}.pbf`)
    for (const arquivo of [
      'light.json',
      'light.png',
      'light@2x.json',
      'light@2x.png'
    ]) {
      expect(existsSync(path.join(PUBLIC_DIR, 'map', 'sprite', arquivo))).toBe(
        true
      )
    }
  })

  /**
   * O mapa existe para achar bar da Onside. O ícone de outro bar, vindo do
   * OpenStreetMap, competiria com o pino — era o que `clickableIcons: false`
   * mais o estilo do Map ID já escondiam no Google.
   */
  it('não traz camada de POI nem de cobertura do solo', () => {
    const ids = estilo.layers.map((camada) => camada.id)
    expect(ids).not.toContain('pois')
    expect(ids).not.toContain('landcover')
    expect(ids.length).toBeGreaterThan(50)
  })

  /**
   * Atribuição não é enfeite: a ODbL do OpenStreetMap e o tier grátis da
   * LocationIQ são condição de uso do que substituiu o Google.
   */
  it('carrega a atribuição obrigatória na própria fonte', () => {
    const atribuicao = (estilo.sources.protomaps as { attribution?: string })
      .attribution
    expect(atribuicao).toContain('OpenStreetMap')
    expect(atribuicao).toContain('LocationIQ')
    expect(atribuicao).toContain('Protomaps')
  })
})
