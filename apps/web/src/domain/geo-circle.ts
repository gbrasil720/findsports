import type { Coordinates } from './discovery'

/**
 * Círculo de raio como polígono geodésico (WEB-73).
 *
 * O Google Maps tinha `google.maps.Circle`, que aceitava centro e raio em
 * metros e desenhava sozinho. O MapLibre não tem primitiva de círculo: o que
 * ele desenha é GeoJSON. Então o círculo do raio de busca vira um polígono.
 *
 * Duas escolhas importam aqui:
 *
 *   1. **Geodésico, não plano.** Um quilômetro em latitude e um quilômetro em
 *      longitude não são o mesmo número de graus, e a diferença cresce com a
 *      distância do equador. Desenhar um círculo em graus daria uma elipse
 *      achatada — em São Paulo, ~8% mais estreita em longitude. Como o raio é
 *      a promessa que a tela faz ("bares a até 5 km"), a forma precisa ser a
 *      distância real.
 *
 *   2. **64 lados.** O erro de um polígono regular inscrito em relação ao
 *      círculo é `1 - cos(π/n)`: com 64 lados dá 0,12% do raio — menos de 6
 *      metros num raio de 5 km, muito abaixo de um pixel em qualquer zoom que
 *      a UI usa. Dobrar para 128 dobraria o custo de `setData` sem mudar um
 *      pixel.
 */

/** Raio médio da Terra (IUGG), em quilômetros. */
const RAIO_DA_TERRA_KM = 6371.0088

const LADOS = 64

/** Anel externo de um polígono GeoJSON: pares `[lng, lat]`, fechado. */
export type AnelDeCoordenadas = Array<[number, number]>

export type PoligonoDeRaio = {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: [AnelDeCoordenadas] }
  properties: Record<string, never>
}

const grausParaRadianos = (graus: number) => (graus * Math.PI) / 180
const radianosParaGraus = (radianos: number) => (radianos * 180) / Math.PI

/**
 * Mantém a longitude em [-180, 180].
 *
 * Um círculo centrado perto do antimeridiano produz longitudes fora da faixa,
 * e o MapLibre desenha a faixa inteira do globo em vez do círculo. Não
 * acontece no Brasil, mas custa uma linha e evita um defeito que só apareceria
 * muito depois, muito longe daqui.
 */
function normalizarLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

/**
 * Ponto a `distanciaKm` do centro, na direção `bearing` (radianos).
 *
 * Fórmula de destino em esfera — a mesma que a haversine resolve ao contrário.
 */
function destino(
  centro: Coordinates,
  distanciaKm: number,
  bearing: number
): [number, number] {
  const angular = distanciaKm / RAIO_DA_TERRA_KM
  const lat1 = grausParaRadianos(centro.lat)
  const lng1 = grausParaRadianos(centro.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    )

  return [normalizarLongitude(radianosParaGraus(lng2)), radianosParaGraus(lat2)]
}

/**
 * Feature GeoJSON do círculo de busca.
 *
 * Devolve uma `Feature` inteira, e não só o anel, porque é isso que
 * `source.setData()` recebe: trocar o raio passa a ser uma chamada só, mais
 * barata que o `setCenter` + `setRadius` que o Google exigia.
 */
export function criarCirculoDeRaio(
  centro: Coordinates,
  raioKm: number
): PoligonoDeRaio {
  const anel: AnelDeCoordenadas = []
  for (let i = 0; i < LADOS; i++) {
    anel.push(destino(centro, raioKm, (2 * Math.PI * i) / LADOS))
  }
  // GeoJSON exige o anel fechado: o último ponto é o primeiro de novo.
  anel.push(anel[0] as [number, number])

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [anel] },
    properties: {}
  }
}

/** Círculo vazio, para a fonte existir antes de haver raio escolhido. */
export const CIRCULO_VAZIO = {
  type: 'FeatureCollection',
  features: []
} as const
