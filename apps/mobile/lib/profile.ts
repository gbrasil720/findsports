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

/**
 * A tela de fora do Flip (WEB-491): o jogo marcado de hoje que ainda não
 * acabou, o mais cedo primeiro.
 */
export function gameToday<
  G extends { startsAt: string | Date; ended: boolean }
>(games: G[], now: number) {
  return (
    games
      .filter((game) => !game.ended && dayKey(game.startsAt) === dayKey(now))
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      )[0] ?? null
  )
}

/** "NÍVEL 4 · 5/8": conquistas até o próximo nível; no último, só o nível. */
export const levelLine = (level: {
  level: number
  unlocked: number
  nextAt: number | null
}) =>
  level.nextAt === null
    ? `NÍVEL ${level.level}`
    : `NÍVEL ${level.level} · ${level.unlocked}/${level.nextAt}`

type SavedBar = {
  barId: string
  bar: { name: string; photoUrl: string | null; neighborhood: string }
}

/**
 * "Seus bares" do Perfil no tablet (tabPort7): onde você foi, do que mais foi
 * ao que menos foi (empate pela visita mais recente), depois os salvos em que
 * ainda não foi. "Foi 4 vezes · 28 set" ou "Salvo".
 */
export function profileBars(
  visits: (Visit & { neighborhood?: string })[],
  saved: SavedBar[]
) {
  const bars = new Map<
    string,
    {
      barId: string
      name: string
      photoUrl: string | null
      times: number
      last: string | Date | null
    }
  >()
  for (const v of visits) {
    const bar = bars.get(v.barId)
    if (!bar)
      bars.set(v.barId, {
        barId: v.barId,
        name: v.barName,
        photoUrl: v.photoUrl,
        times: 1,
        last: v.startsAt
      })
    else {
      bar.times += 1
      if (new Date(v.startsAt) > new Date(bar.last ?? 0)) bar.last = v.startsAt
    }
  }
  for (const s of saved)
    if (!bars.has(s.barId))
      bars.set(s.barId, {
        barId: s.barId,
        name: s.bar.name,
        photoUrl: s.bar.photoUrl,
        times: 0,
        last: null
      })
  const time = (d: string | Date | null) => (d ? new Date(d).getTime() : 0)
  return [...bars.values()]
    .sort((a, b) => b.times - a.times || time(b.last) - time(a.last))
    .map((bar) => ({
      ...bar,
      sub: bar.last
        ? `Foi ${bar.times} ${bar.times === 1 ? 'vez' : 'vezes'} · ${shortDay(bar.last)}`
        : 'Salvo'
    }))
}

/** "28 set". */
const shortDay = (date: string | Date) =>
  new Date(date)
    .toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      timeZone: TZ
    })
    .replace(' de ', ' ')
    .replace('.', '')

/**
 * "Sua retrospectiva de outubro" (tabPort7): bares, jogos e bairros do mês
 * e o bar em que mais foi. Sem visita no mês, nada.
 */
export function monthRecap(
  visits: (Visit & { neighborhood: string })[],
  now: number
) {
  const month = dayKey(now).slice(0, 7)
  const inMonth = visits.filter((v) => dayKey(v.startsAt).startsWith(month))
  if (!inMonth.length) return null
  const top = topBars(inMonth, now).bars[0]
  return {
    month: new Date(now).toLocaleDateString('pt-BR', {
      month: 'long',
      timeZone: TZ
    }),
    bars: new Set(inMonth.map((v) => v.barId)).size,
    games: inMonth.length,
    neighborhoods: new Set(inMonth.map((v) => v.neighborhood)).size,
    top: top ?? null
  }
}
