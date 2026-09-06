/**
 * Chave de cache da busca geográfica.
 *
 * Coordenadas exatas: distância, ordenação e cursor também dependem da origem
 * exata, então aproximá-la faria páginas incompatíveis compartilharem cache.
 * TTL curto fica no caller: a busca depende de `starts_at >= NOW()`.
 *
 * Só entra dado global. Nada derivado de sessão.
 */

/**
 * Caminho que produziu a página (ESC-19). Entra na chave porque a busca tem
 * dois caminhos e o interruptor entre eles é usado durante incidente: se a
 * chave não distinguisse, desligar o caminho suspeito continuaria servindo,
 * por até um TTL, exatamente as páginas que ele produziu.
 */
export type ModoBusca = 'camadas' | 'linear' | 'nota'

export type ChaveBuscaInput = {
  modo: ModoBusca
  lat: number
  lng: number
  radiusKm: number
  sportId?: string
  championship?: string
  date?: string
  /**
   * Já normalizada pelo roteador — sem repetido, sem id desconhecido e
   * ORDENADA. A ordem importa aqui: `[1,4]` e `[4,1]` são o mesmo filtro, e
   * sem ordenar virariam duas entradas para o mesmo resultado.
   */
  amenities?: number[]
  cursor?: string
  limit: number
}

export type ChaveLocalInput = {
  lat: number
  lng: number
  radiusKm: number
  cursor?: string
  limit: number
}

export function chaveBusca(input: ChaveBuscaInput): string {
  return [
    input.modo,
    input.lat,
    input.lng,
    input.radiusKm,
    input.sportId ?? '',
    (input.championship ?? '').toLowerCase(),
    input.date ?? '',
    (input.amenities ?? []).join(','),
    input.cursor ?? '',
    input.limit
  ].join('|')
}

export function chaveBuscaLocal(input: ChaveLocalInput): string {
  return [
    input.lat,
    input.lng,
    input.radiusKm,
    input.cursor ?? '',
    input.limit
  ].join('|')
}
