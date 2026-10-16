import { getEventEnd } from '@findsports_oficial/db/event-window'

/*
 * Contas do Explorar ("07" do design) que não dependem de tela: de onde a
 * busca parte, se o jogo está ao vivo, distância e hora como o design
 * escreve. O fim do jogo vem da mesma fonte que o servidor usa (WEB-119).
 */

export type Coordinates = { lat: number; lng: number }

/** Centro de São Paulo: a busca cai aqui sem localização nem cidade. */
export const SAO_PAULO = { lat: -23.5505, lng: -46.6333 }

/** Localização do aparelho, senão a cidade do perfil, senão São Paulo. */
export function searchCenter(
  device: Coordinates | null,
  profileCity: Coordinates | null | undefined
): Coordinates {
  const { lat, lng } = device ?? profileCity ?? SAO_PAULO
  return { lat, lng }
}

type Game = { startsAt: string | Date; endsAt: string | Date | null }

/** Começou e ainda não passou do fim (informado ou derivado). */
export function isLive(game: Game, now = Date.now()) {
  return (
    new Date(game.startsAt).getTime() <= now &&
    now <= getEventEnd(game).getTime()
  )
}

/** "0,8 km"; abaixo de 1 km o design também escreve em km. */
export function formatKm(km: number) {
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: km < 10 ? 1 : 0 })} km`
}

/** "21:30", no horário de Brasília, como os jogos são cadastrados. */
export function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })
}

/** "COR", "PAL": a sigla no círculo do time, sem acento. */
export function teamMark(name: string) {
  return name
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase()
}

/** Distância em linha reta (Haversine), para a página do bar. */
export function distanceKm(a: Coordinates, b: Coordinates) {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** "Bom dia", "Boa tarde", "Boa noite" pela hora de Brasília. */
export function greeting(now = new Date()) {
  const hour = Number(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Sao_Paulo'
    })
  )
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}
