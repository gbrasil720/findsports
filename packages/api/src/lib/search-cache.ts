/**
 * Chave de cache da busca geográfica.
 *
 * Coordenadas arredondadas a 3 casas (~110 m). Sem isso cada GPS gera chave
 * própria e o cache nunca acerta. TTL curto fica no caller: a busca depende
 * de `starts_at >= NOW()`.
 *
 * Só entra dado global. Nada derivado de sessão.
 */

/**
 * Caminho que produziu a página (ESC-19). Entra na chave porque a busca tem
 * dois caminhos e o interruptor entre eles é usado durante incidente: se a
 * chave não distinguisse, desligar o caminho suspeito continuaria servindo,
 * por até um TTL, exatamente as páginas que ele produziu.
 */
export type ModoBusca = 'camadas' | 'linear'

export type ChaveBuscaInput = {
  modo: ModoBusca
  lat: number
  lng: number
  radiusKm: number
  sportId?: string
  championship?: string
  date?: string
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
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    input.radiusKm,
    input.sportId ?? '',
    (input.championship ?? '').toLowerCase(),
    input.date ?? '',
    input.cursor ?? '',
    input.limit
  ].join('|')
}

export function chaveBuscaLocal(input: ChaveLocalInput): string {
  return [
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    input.radiusKm,
    input.cursor ?? '',
    input.limit
  ].join('|')
}
