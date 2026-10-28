import 'maplibre-gl/dist/maplibre-gl.css'

import { type Flavor, layers, namedFlavor } from '@protomaps/basemaps'
import {
  Map as MapaLibre,
  type StyleSpecification,
  setWorkerUrl
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/*
 * O mapa da prévia "Como o torcedor vê" (WEB-456): MapLibre com os tiles da
 * Onside (Worker `apps/tiles`). Este módulo só entra por `import()` em
 * `mapa-da-previa.tsx`: nada de MapLibre no bundle de entrada nem nas outras
 * telas. Runbook dos tiles em `docs/map-tiles.md`.
 */

// Sem isto o MapLibre monta a URL do worker sozinho e, empacotado, ela dá
// 404: o canvas aparece e nenhum tile é desenhado, sem erro (WEB-73).
setWorkerUrl(workerUrl)

/** TileJSON do build atual. Rebuild do archive = nome novo aqui. */
export const TILES_URL = 'https://tiles.onside.sh/onside-br-20260906.json'

/** Glyphs na mesma origem (`public/map/fonts`); o MapLibre exige URL absoluta. */
const GLYPHS = '/map/fonts/{fontstack}/{range}.pbf'

/**
 * As cores do mapa do app (`apps/mobile/lib/map-style.ts`), as mesmas do
 * Google Maps no Android: quadras em papel, ruas claras, rótulos apagados.
 */
const CORES = {
  claro: {
    land: '#ece9e1',
    block: '#e5e1d7',
    road: '#faf8f3',
    highway: '#f6f3ea',
    water: '#c9d1cf',
    park: '#dfe4cf',
    label: '#6b6860',
    halo: '#f1eee6'
  },
  escuro: {
    land: '#1a1a17',
    block: '#20201c',
    road: '#2c2c27',
    highway: '#35352f',
    water: '#0f1416',
    park: '#1f241a',
    label: '#8f8b81',
    halo: '#12120f'
  }
}

function sabor(escuro: boolean): Flavor {
  const c = escuro ? CORES.escuro : CORES.claro
  const base = namedFlavor(escuro ? 'dark' : 'light')
  const via = (chaves: string[], cor: string) =>
    Object.fromEntries(chaves.map((k) => [k, cor]))
  return {
    ...base,
    // Sem pontos de interesse nem cobertura do solo, como no app: os pinos
    // são dos bares.
    pois: undefined,
    landcover: undefined,
    background: c.land,
    earth: c.land,
    water: c.water,
    buildings: c.block,
    ...via(
      ['hospital', 'industrial', 'school', 'pedestrian', 'aerodrome'],
      c.block
    ),
    ...via(['park_a', 'park_b', 'wood_a', 'wood_b', 'zoo'], c.park),
    ...via(
      [
        'other',
        'minor_service',
        'minor_a',
        'minor_b',
        'link',
        'major',
        'bridges_other',
        'bridges_minor',
        'bridges_link',
        'bridges_major',
        'tunnel_other',
        'tunnel_minor',
        'tunnel_link',
        'tunnel_major'
      ],
      c.road
    ),
    ...via(['highway', 'bridges_highway', 'tunnel_highway'], c.highway),
    ...via(
      [
        'minor_service_casing',
        'minor_casing',
        'link_casing',
        'major_casing_early',
        'major_casing_late',
        'highway_casing_early',
        'highway_casing_late',
        'bridges_other_casing',
        'bridges_minor_casing',
        'bridges_link_casing',
        'bridges_major_casing',
        'bridges_highway_casing',
        'tunnel_other_casing',
        'tunnel_minor_casing',
        'tunnel_link_casing',
        'tunnel_major_casing',
        'tunnel_highway_casing'
      ],
      c.block
    ),
    ...via(
      [
        'roads_label_minor',
        'roads_label_major',
        'subplace_label',
        'city_label',
        'address_label'
      ],
      c.label
    ),
    ...via(
      [
        'roads_label_minor_halo',
        'roads_label_major_halo',
        'subplace_label_halo',
        'city_label_halo',
        'address_label_halo'
      ],
      c.halo
    )
  }
}

/**
 * Sem sprite: as duas camadas que só são ícone saem, e as outras perdem o
 * ícone e ficam com o texto (o app também não mostra escudo de rodovia).
 */
const SO_ICONE = new Set(['roads_oneway', 'roads_shields'])

export function estiloDoMapa(
  escuro: boolean,
  origem: string
): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origem}${GLYPHS}`,
    sources: { protomaps: { type: 'vector', url: TILES_URL } },
    layers: layers('protomaps', sabor(escuro), { lang: 'pt' })
      .filter((camada) => !SO_ICONE.has(camada.id))
      .map((camada) => {
        if (camada.type !== 'symbol' || !camada.layout?.['icon-image'])
          return camada
        const { 'icon-image': _, ...layout } = camada.layout
        return { ...camada, layout }
      })
  }
}

export type Enquadramento = {
  centro: { lat: number; lng: number }
  zoom: number
  /** Espaço reservado no topo: o centro cai no meio do que sobra. */
  topo?: number
}

/** Mapa parado, sem gesto nem controle: é só desenho. */
export function criarMapa(
  container: HTMLElement,
  { centro, zoom, topo = 0 }: Enquadramento,
  escuro: boolean
) {
  const mapa = new MapaLibre({
    container,
    style: estiloDoMapa(escuro, window.location.origin),
    center: [centro.lng, centro.lat],
    zoom,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0
  })
  mapa.setPadding({ top: topo, bottom: 0, left: 0, right: 0 })
  return mapa
}
