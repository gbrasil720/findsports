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

/** "COR", "GRÊ": a sigla no círculo do time, com acento, como no design. */
export function teamMark(name: string) {
  return name
    .replace(/[^\p{L}]/gu, '')
    .slice(0, 3)
    .toLocaleUpperCase('pt-BR')
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

/**
 * O primeiro nome, como a folha e os avisos chamam um amigo: a primeira
 * palavra com letra ("🦁 Leo" vira "Leo").
 */
export const firstName = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .find((word) => /\p{L}/u.test(word)) ?? name.trim()

/**
 * "34 pessoas vão, entre elas Marina e Rafael" (3d do design, WEB-404). O
 * servidor só manda amigos que deixam ser vistos (`readGoing`); abaixo do piso
 * não há contagem, só os amigos ("Marina e Rafael vão"). `faces` são as
 * letras da pilha, amigos primeiro; `more` é o "+32".
 */
export function goingSummary(going: {
  count: number | null
  initials: string[]
  friends: { name: string }[]
}) {
  const names = going.friends.map((friend) => firstName(friend.name))
  const listed = names.length > 3 ? names.slice(0, 2) : names
  const extra = names.length - listed.length
  const list = [
    ...listed,
    ...(extra ? [`mais ${extra} ${extra === 1 ? 'amigo' : 'amigos'}`] : [])
  ]
  const joined =
    list.length > 1
      ? `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`
      : list[0]
  const faces = [
    ...names.map((name) =>
      (Array.from(name)[0] ?? '').toLocaleUpperCase('pt-BR')
    ),
    ...going.initials
  ]
    .filter(Boolean)
    .slice(0, 2)
  if (going.count === null)
    return {
      faces,
      more: Math.max(names.length - faces.length, 0),
      lead: `${joined} ${names.length === 1 ? 'vai' : 'vão'}`,
      tail: ''
    }
  return {
    faces,
    more: Math.max(going.count - faces.length, 0),
    lead: `${going.count.toLocaleString('pt-BR')} ${going.count === 1 ? 'pessoa vai' : 'pessoas vão'}`,
    tail: joined ? `, entre elas ${joined}` : ''
  }
}
