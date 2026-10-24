import { BRASILIA_TIME_ZONE as TZ } from '@findsports_oficial/db/event-window'
import { dayKey } from './your-bars'

/*
 * Perfil (2l do design, seção 10): as contas da tela, puras e no dia de
 * Brasília. A tela fica em `app/(fan)/voce/perfil.tsx`.
 */

/** "torcedor desde set. 2026". */
export function memberSince(createdAt: string | Date) {
  const month = new Date(createdAt)
    .toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
      timeZone: TZ
    })
    .replace(' de ', ' ')
  return `torcedor desde ${month}`
}

/** Seus bares: onde você já foi e os que salvou, cada bar uma vez. */
export function yourBarCount(
  visits: { barId: string }[],
  saved: { barId: string }[]
) {
  return new Set([...visits, ...saved].map(({ barId }) => barId)).size
}

/** Jogos marcados com início hoje, no dia de Brasília. */
export const markedToday = (
  games: { startsAt: string | Date }[],
  now: number
) => games.filter((game) => dayKey(game.startsAt) === dayKey(now)).length

type SavedGame = {
  id: string
  startsAt: string | Date
  sport: { name: string }
}

/**
 * "Próximos jogos nos seus bares": os próximos dos bares salvos, do mais
 * perto ao mais longe. O servidor já manda só o que não acabou.
 */
export function nextInSaved<G extends SavedGame>(
  saved: {
    barId: string
    bar: { name: string; photoUrl: string | null; events: G[] }
  }[],
  limit = 3
) {
  return saved
    .flatMap(({ barId, bar }) =>
      bar.events.map((game) => ({
        barId,
        barName: bar.name,
        photoUrl: bar.photoUrl,
        game
      }))
    )
    .sort(
      (a, b) =>
        new Date(a.game.startsAt).getTime() -
        new Date(b.game.startsAt).getTime()
    )
    .slice(0, limit)
}

type Visit = {
  barId: string
  barName: string
  photoUrl: string | null
  startsAt: string | Date
}

/**
 * "Bares que você mais foi": os três com mais jogos no mês. Sem visita no
 * mês, conta todas, e a etiqueta diz "ao todo".
 */
export function topBars(visits: Visit[], now: number) {
  const month = dayKey(now).slice(0, 7)
  const inMonth = visits.filter((v) => dayKey(v.startsAt).startsWith(month))
  const pool = inMonth.length ? inMonth : visits
  const label = inMonth.length
    ? new Date(now).toLocaleDateString('pt-BR', { month: 'long', timeZone: TZ })
    : 'ao todo'
  const bars = new Map<string, Visit & { games: number }>()
  for (const visit of pool) {
    const bar = bars.get(visit.barId)
    if (bar) bar.games += 1
    else bars.set(visit.barId, { ...visit, games: 1 })
  }
  return {
    label,
    bars: [...bars.values()]
      .sort(
        (a, b) =>
          b.games - a.games || a.barName.localeCompare(b.barName, 'pt-BR')
      )
      .slice(0, 3)
  }
}
