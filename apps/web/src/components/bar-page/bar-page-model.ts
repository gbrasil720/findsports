import {
  AMENITIES,
  AMENITY_GROUPS
} from '@findsports_oficial/api/lib/amenities'
import type { PublicGame } from '@findsports_oficial/api/lib/public-bar-page'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDay,
  getEventEnd
} from '@findsports_oficial/db/event-window'

/*
 * Contas da página pública do bar (`/bar/$slug`): rótulos de hora no relógio
 * de Brasília, o jogo do cartão, a frase de quem vai, título e descrição que
 * mudam com a grade do dia e o JSON-LD. Puras: o `now` vem do loader, o mesmo
 * no servidor e na hidratação.
 */

export type PageBar = {
  id: string
  name: string
  description: string | null
  address: string
  neighborhood: string
  city: string
  uf: string | null
  latitude: string
  longitude: string
  phone: string | null
  photoUrl: string | null
  screenCount: number | null
  amenities: number[]
  rating: {
    total: number
    percentage: number
    /** Média das estrelas, `null` abaixo do piso de estrelas. */
    stars?: number | null
    starsCount?: number
  } | null
  openingHours: ({ opens: string; closes: string } | null)[] | null
  opening: {
    open: boolean
    closes: string | null
    opens: { day: string; time: string } | null
    today: string
  } | null
  events: PublicGame[]
}

/** "4,6": uma casa, vírgula. */
export const starsLabel = (stars: number) =>
  stars.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })

/** "25 out", o dia de Brasília. */
export function shortDate(at: Date): string {
  return new Date(at)
    .toLocaleDateString('pt-BR', {
      timeZone: BRASILIA_TIME_ZONE,
      day: 'numeric',
      month: 'short'
    })
    .replace('.', '')
    .replace(' de ', ' ')
}

/** "21:30" no relógio de Brasília, seja qual for o fuso de quem lê. */
export function clock(at: Date): string {
  return new Date(at).toLocaleTimeString('pt-BR', {
    timeZone: BRASILIA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit'
  })
}

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "hoje", "amanhã" ou "dom 08/11", pelo dia de Brasília. */
export function dayLabel(at: Date, now: Date): string {
  const day = brasiliaDay(at)
  if (day === brasiliaDay(now)) return 'hoje'
  if (day === brasiliaDay(now, 1)) return 'amanhã'
  const [, month, date] = day.split('-')
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return `${WEEKDAY[weekday]} ${date}/${month}`
}

export type GameState = 'live' | 'upcoming' | 'ended'

export function gameState(
  game: Pick<PublicGame, 'startsAt' | 'endsAt'>,
  now: Date
): GameState {
  if (getEventEnd(game).getTime() <= now.getTime()) return 'ended'
  return new Date(game.startsAt).getTime() <= now.getTime()
    ? 'live'
    : 'upcoming'
}

/** O jogo do cartão: o pedido na URL (`?jogo=`), senão o primeiro que não acabou. */
export function pickGame(
  events: PublicGame[],
  wanted: string | undefined,
  now: Date
): PublicGame | null {
  const open = events.filter((game) => gameState(game, now) !== 'ended')
  return open.find((game) => game.id === wanted) ?? open[0] ?? null
}

/** Os jogos de hoje (dia de Brasília) que ainda não acabaram. */
export function todayGames(events: PublicGame[], now: Date): PublicGame[] {
  const today = brasiliaDay(now)
  return events.filter(
    (game) =>
      brasiliaDay(game.startsAt) === today && gameState(game, now) !== 'ended'
  )
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/**
 * A frase de quem vai. Amigo só é nomeado com sessão e pela regra do
 * servidor (`readFriendsGoing`); a contagem só acima do piso.
 */
export function goingText(
  count: number | null,
  friends: readonly { name: string }[]
): { count: number | null; text: string } | null {
  const names = friends.slice(0, 2).map((f) => firstName(f.name))
  const list =
    names.length === 2 ? `${names[0]} e ${names[1]}` : (names[0] ?? '')
  if (count !== null) {
    return {
      count,
      text: names.length
        ? `pessoas vão, entre elas ${list}`
        : 'pessoas vão assistir aqui'
    }
  }
  if (!names.length) return null
  return {
    count: null,
    text: `${list} ${names.length === 1 && friends.length === 1 ? 'vai' : 'vão'} assistir aqui`
  }
}

/** "3 telões", "Telão" ou nada. */
export function screensLabel(bar: Pick<PageBar, 'screenCount' | 'amenities'>) {
  if (bar.screenCount && bar.screenCount > 1) return `${bar.screenCount} telões`
  if (bar.screenCount === 1 || bar.amenities.includes(1)) return 'Telão'
  return null
}

/** As características declaradas, nos grupos e na ordem do cadastro. */
export function amenityGroups(ids: readonly number[]) {
  return AMENITY_GROUPS.map((group) => ({
    label: group.label,
    items: AMENITIES.filter(
      (item) => item.group === group.key && ids.includes(item.id)
    )
  })).filter((group) => group.items.length)
}

/** O que a casa tem, em poucas palavras, para descrição e cartão. */
function highlights(bar: PageBar): string {
  const parts = [
    screensLabel(bar)?.toLowerCase(),
    bar.amenities.includes(2) ? 'som do jogo' : null,
    bar.amenities.includes(4) ? 'área externa' : null
  ].filter(Boolean)
  return parts.join(', ')
}

const DESCRIPTION_MAX = 158

const clip = (text: string, max = DESCRIPTION_MAX) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

/** `<title>`: o jogo de hoje na frente, a marca no fim (`docs/seo.md`). */
export function barPageTitle(bar: PageBar, now: Date): string {
  const [first] = todayGames(bar.events, now)
  if (first)
    return `Onde assistir ${first.title} hoje: ${bar.name}, ${bar.neighborhood} — Onside`
  return `${bar.name}, ${bar.neighborhood}: jogos no telão — Onside`
}

/** Descrição para o Google, com a grade de hoje ou a próxima. */
export function barPageDescription(bar: PageBar, now: Date): string {
  const today = todayGames(bar.events, now)
  const extra = highlights(bar)
  const place = `${extra ? `${extra[0]?.toUpperCase()}${extra.slice(1)} em ` : 'Em '}${bar.neighborhood}, ${bar.city}.`
  const open =
    bar.opening?.open && bar.opening.closes
      ? ` Aberto até ${bar.opening.closes}.`
      : ''
  let lead = `${bar.name}: onde ver o jogo.`
  if (today.length) {
    const games = today
      .slice(0, 3)
      .map((game) =>
        gameState(game, now) === 'live'
          ? `${game.title} ao vivo`
          : `${game.title} às ${clock(game.startsAt)}`
      )
      .join(', ')
    lead = `Hoje no ${bar.name}: ${games}.`
  } else {
    const next = bar.events.find((game) => gameState(game, now) !== 'ended')
    if (next)
      lead = `Próximo jogo no ${bar.name}: ${next.title}, ${dayLabel(next.startsAt, now)} às ${clock(next.startsAt)}.`
  }
  // O horário é o primeiro a sair quando não cabe; o resto corta no fim.
  const full = `${lead} ${place}${open}`
  return clip(full.length <= DESCRIPTION_MAX ? full : `${lead} ${place}`)
}

/** O cartão do link no WhatsApp: curto, com o jogo da vez. */
export function barSocial(bar: PageBar, now: Date) {
  const title = `${bar.name} · ${bar.neighborhood}`
  const [first] = todayGames(bar.events, now)
  if (!first) {
    const extra = highlights(bar)
    return {
      title,
      description: extra
        ? `${extra[0]?.toUpperCase()}${extra.slice(1)}. Veja a grade de jogos na Onside.`
        : 'Veja a grade de jogos na Onside.'
    }
  }
  const lead =
    gameState(first, now) === 'live'
      ? `Ao vivo agora: ${first.title}`
      : `Hoje ${clock(first.startsAt)}: ${first.title}`
  const going = first.going ? ` ${first.going} pessoas vão.` : ''
  return {
    title,
    description: `${lead}${first.onBigScreen ? ' no telão' : ''}.${going}`
  }
}

/** ISO com o fuso de Brasília, como o Google pede no `Event`. */
export function brasiliaIso(at: Date): string {
  const day = brasiliaDay(at)
  return `${day}T${clock(at)}:00-03:00`
}

const DAY_SCHEMA = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

/**
 * JSON-LD da página: o bar (`BarOrPub`) e um `Event` por jogo que não
 * acabou. A nota só sai quando a página a mostra (acima do piso público).
 */
export function barJsonLd(bar: PageBar, url: string, now: Date) {
  const id = `${url}#bar`
  const address = {
    '@type': 'PostalAddress',
    streetAddress: bar.address,
    addressLocality: bar.city,
    ...(bar.uf ? { addressRegion: bar.uf } : {}),
    addressCountry: 'BR'
  }
  const place = {
    '@type': 'BarOrPub',
    '@id': id,
    name: bar.name,
    url,
    ...(bar.description ? { description: bar.description } : {}),
    ...(bar.photoUrl ? { image: bar.photoUrl } : {}),
    ...(bar.phone ? { telephone: bar.phone } : {}),
    address,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: Number(bar.latitude),
      longitude: Number(bar.longitude)
    },
    ...(bar.openingHours
      ? {
          openingHoursSpecification: bar.openingHours.flatMap((day, index) =>
            day
              ? [
                  {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: `https://schema.org/${DAY_SCHEMA[index]}`,
                    opens: day.opens,
                    closes: day.closes
                  }
                ]
              : []
          )
        }
      : {}),
    ...(bar.rating
      ? {
          // As estrelas (1 a 5) são a nota que o schema.org espera; sem
          // estrelas que bastem, a porcentagem de "voltaria", de 0 a 100.
          aggregateRating:
            bar.rating.stars != null
              ? {
                  '@type': 'AggregateRating',
                  ratingValue: bar.rating.stars,
                  bestRating: 5,
                  worstRating: 1,
                  ratingCount: bar.rating.starsCount ?? bar.rating.total
                }
              : {
                  '@type': 'AggregateRating',
                  ratingValue: bar.rating.percentage,
                  bestRating: 100,
                  worstRating: 0,
                  ratingCount: bar.rating.total
                }
        }
      : {})
  }
  const events = bar.events
    .filter((game) => gameState(game, now) !== 'ended')
    .map((game) => ({
      '@type': 'Event',
      name: `${game.title} no ${bar.name}`,
      startDate: brasiliaIso(game.startsAt),
      endDate: brasiliaIso(getEventEnd(game)),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: true,
      url,
      ...(bar.photoUrl ? { image: bar.photoUrl } : {}),
      location: { '@type': 'BarOrPub', '@id': id, name: bar.name, address },
      ...(game.championship !== game.title
        ? { description: `${game.championship}, no telão do ${bar.name}.` }
        : {})
    }))
  return { '@context': 'https://schema.org', '@graph': [place, ...events] }
}
