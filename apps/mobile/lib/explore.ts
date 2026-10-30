import {
  isEventLive,
  BRASILIA_TIME_ZONE as TZ
} from '@findsports_oficial/db/event-window'
import {
  gameTitle,
  matchSides,
  type TitledGame
} from '@findsports_oficial/db/game-title'

/*
 * Contas do Explorar ("07" do design) que não dependem de tela: de onde a
 * busca parte, se o jogo está ao vivo, distância e hora como o design
 * escreve. O fim do jogo vem da mesma fonte que o servidor usa (WEB-119).
 */

export type Coordinates = { lat: number; lng: number }

/**
 * Centro de São Paulo: a busca cai aqui sem localização nem cidade. É a sede
 * de `municipios-centros.json`, a mesma de quem escolheu São Paulo no perfil,
 * e a mesma do web (`SAO_PAULO_FALLBACK`).
 */
export const SAO_PAULO = { lat: -23.5329, lng: -46.6395 }

/** Localização do aparelho, senão a cidade do perfil, senão São Paulo. */
export function searchCenter(
  device: Coordinates | null,
  profileCity: Coordinates | null | undefined
): Coordinates {
  const { lat, lng } = device ?? profileCity ?? SAO_PAULO
  return { lat, lng }
}

/** Começou e ainda não chegou ao fim (informado ou derivado). */
export const isLive = isEventLive

/** "0,8 km"; abaixo de 1 km o design também escreve em km. */
export function formatKm(km: number) {
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: km < 10 ? 1 : 0 })} km`
}

/** "21:30", no horário de Brasília, como os jogos são cadastrados. */
export function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
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
      timeZone: TZ
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

/**
 * A tela de fora do Z Flip 8 (regra 07 da T1): só os bares com jogo, do mais
 * perto para o mais longe, um por página. Cinco bastam para deslizar.
 */
export function coverBars<
  T extends { distance_km: number; nextEvent?: unknown }
>(bars: T[]): T[] {
  return bars
    .filter((bar) => bar.nextEvent)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 5)
}

/**
 * Em que parte do jogo de futebol estamos, pelo relógio desde o início
 * (aproximado: 45 + 2 de acréscimo, 15 de intervalo, 45 + 3). Os outros
 * esportes e o fim da janela ficam "Ao vivo"; antes de começar, `null`.
 */
export function matchPeriod(
  game: { startsAt: string; endsAt: string | null; sport?: { slug: string } },
  now: number
): string | null {
  if (!isLive(game, now)) return null
  if (game.sport?.slug !== 'futebol') return 'Ao vivo'
  const minutes = (now - Date.parse(game.startsAt)) / 60_000
  if (minutes < 47) return '1º tempo'
  if (minutes < 62) return 'Intervalo'
  if (minutes < 110) return '2º tempo'
  return 'Ao vivo'
}

/**
 * O jogo na tela de fora: "COR × PAL · 2º TEMPO" (ou "AO VIVO") e
 * "COR × PAL · 21:30" antes de começar; fora do confronto, o título.
 */
export function coverKicker(
  game: TitledGame & {
    startsAt: string
    endsAt: string | null
    sport?: { slug: string }
  },
  now: number
) {
  const sides = matchSides(game)
  const what = sides
    ? sides.map(teamMark).join(' × ')
    : gameTitle(game).toLocaleUpperCase('pt-BR')
  const when = matchPeriod(game, now)?.toLocaleUpperCase('pt-BR')
  return `${what} · ${when ?? formatTime(game.startsAt)}`
}
