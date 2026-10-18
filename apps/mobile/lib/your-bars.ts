import { formatTime, isLive } from './explore'

/*
 * Seus bares (17b e 17d do design): as datas da semana, o calendário das
 * visitas e os grupos de jogos dos salvos. Contas puras, no dia de Brasília;
 * a tela fica em `app/(fan)/favoritos.tsx`.
 */

const TZ = 'America/Sao_Paulo'
const DAY = 86_400_000

/** "2026-10-17": o dia de Brasília, para comparar datas. */
export const dayKey = (date: string | number | Date) =>
  new Date(date).toLocaleDateString('en-CA', { timeZone: TZ })

/** 0 = segunda … 6 = domingo, em Brasília. */
function weekday(date: number) {
  const name = new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: TZ
  })
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name)
}

/** Os sete dias da semana de `now`, de segunda a domingo (meio-dia de cada). */
export function weekOf(now: number) {
  const monday = now - weekday(now) * DAY
  return Array.from({ length: 7 }, (_, i) => monday + i * DAY)
}

/** As letras do cabeçalho: segunda a domingo. */
export const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

/**
 * O calendário de "Já fui": quatro semanas até a atual, uma por linha, de
 * segunda a domingo; `on` onde houve jogo com código validado. `key` é o dia.
 */
export function visitGrid(visits: { startsAt: string | Date }[], now: number) {
  const days = new Set(visits.map((v) => dayKey(v.startsAt)))
  const monday = weekOf(now)[0] as number
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => {
      const key = dayKey(monday - (3 - row) * 7 * DAY + col * DAY)
      return { key, on: days.has(key) }
    })
  )
}

/** As colunas do calendário: a letra e uma chave por dia da semana. */
export const WEEK_COLUMNS = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sab',
  'dom'
].map((key, i) => ({ key, letter: WEEK_LETTERS[i] as string }))

const monthName = (date: string | Date) => {
  const name = new Date(date).toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: TZ
  })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** As visitas por mês, na ordem em que chegam (da mais recente). */
export function byMonth<V extends { startsAt: string | Date }>(visits: V[]) {
  const groups: { key: string; label: string; rows: V[] }[] = []
  for (const visit of visits) {
    const key = dayKey(visit.startsAt).slice(0, 7)
    const last = groups.at(-1)
    if (last?.key === key) last.rows.push(visit)
    else groups.push({ key, label: monthName(visit.startsAt), rows: [visit] })
  }
  return groups
}

/** "04" e "OUT": o dia e o mês da linha de "Já fui". */
export function dayMonth(date: string | Date) {
  const d = new Date(date)
  return {
    day: d.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: TZ }),
    month: d
      .toLocaleDateString('pt-BR', { month: 'short', timeZone: TZ })
      .replace('.', '')
      .toLocaleUpperCase('pt-BR')
  }
}

type Game = {
  startsAt: string | Date
  endsAt: string | Date | null
}

type Saved = {
  barId: string
  bar: { name: string; neighborhood: string; events: Game[] }
}

const weekdayName = (date: number) => {
  const name = new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    timeZone: TZ
  })
  return name.replace('-feira', '').replace(/^./, (c) => c.toUpperCase())
}

/**
 * A semana dos salvos (17d): quantos jogos em cada dia, os jogos agrupados
 * por dia ("Hoje", "Sábado") e, no fim, os bares sem jogo nesta semana.
 */
export function savedWeek<S extends Saved>(saved: S[], now: number) {
  const week = weekOf(now)
  const keys = week.map(dayKey)
  const today = dayKey(now)
  const tomorrow = dayKey(now + DAY)
  const games = saved
    .flatMap((s) =>
      (s.bar.events as S['bar']['events'][number][]).map((game) => ({
        saved: s,
        game
      }))
    )
    .filter(({ game }) => keys.includes(dayKey(game.startsAt)))
    .sort(
      (a, b) =>
        new Date(a.game.startsAt).getTime() -
          new Date(b.game.startsAt).getTime() ||
        a.saved.bar.name.localeCompare(b.saved.bar.name, 'pt-BR')
    )
  const days = week.map((date, i) => ({
    date,
    key: keys[i] as string,
    today: keys[i] === today,
    count: games.filter(({ game }) => dayKey(game.startsAt) === keys[i]).length
  }))
  const groups = days
    .filter((d) => d.count)
    .map((d) => ({
      key: d.key,
      label:
        d.key === today
          ? 'Hoje'
          : d.key === tomorrow
            ? 'Amanhã'
            : weekdayName(d.date),
      games: games.filter(({ game }) => dayKey(game.startsAt) === d.key)
    }))
  const busy = new Set(games.map(({ saved: s }) => s.barId))
  const idle = saved
    .filter((s) => !busy.has(s.barId))
    .sort((a, b) => a.bar.name.localeCompare(b.bar.name, 'pt-BR'))
  return { days, groups, idle, today: days.find((d) => d.today)?.count ?? 0 }
}

/** A coluna da hora no jogo dos salvos: "AGORA", ou "21:30" e "HOJE"/"SÁB 18". */
export function gameWhen(game: Game, now: number) {
  if (isLive(game, now)) return { live: true, time: 'AGORA', day: '' }
  const day =
    dayKey(game.startsAt) === dayKey(now)
      ? 'HOJE'
      : new Date(game.startsAt)
          .toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            timeZone: TZ
          })
          .replace(/[.,]/g, '')
          .toLocaleUpperCase('pt-BR')
  return { live: false, time: formatTime(game.startsAt), day }
}

type Coords = { lat: number; lng: number }

/** Um bar da aba "Bares" (17e): um dos que você salvou. */
export type YourBar = {
  barId: string
  name: string
  neighborhood: string
  photoUrl: string | null
  km: number | null
  /** Jogos com código validado lá. */
  visits: number
  saved: boolean
  /** Bar fora do ar não abre a página. */
  active: boolean
}

type BarInfo = {
  name: string
  neighborhood: string
  photoUrl: string | null
  latitude: string | number | null
  longitude: string | number | null
}

/**
 * Os bares de "Bares" (17e): os salvos, com quantas vezes você foi a cada um
 * (código validado) e a distância; e o resumo por bairro do topo. Bar
 * visitado e não salvo fica só em "Já fui" (pedido do dono, 17/10/2026).
 */
export function yourBars(
  visits: (Omit<BarInfo, 'name'> & {
    barId: string
    barName: string
    barActive: boolean
  })[],
  saved: { barId: string; bar: BarInfo }[],
  from: Coords,
  distance: (a: Coords, b: Coords) => number
) {
  const km = (b: Pick<BarInfo, 'latitude' | 'longitude'>) =>
    b.latitude === null || b.longitude === null
      ? null
      : distance(from, { lat: Number(b.latitude), lng: Number(b.longitude) })
  const bars = new Map<string, YourBar>()
  for (const s of saved)
    bars.set(s.barId, {
      barId: s.barId,
      name: s.bar.name,
      neighborhood: s.bar.neighborhood,
      photoUrl: s.bar.photoUrl,
      km: km(s.bar),
      visits: 0,
      saved: true,
      active: true
    })
  // Só os salvos entram; as visitas contam quantas vezes você foi a cada um.
  for (const v of visits) {
    const known = bars.get(v.barId)
    if (known) known.visits++
  }
  const list = [...bars.values()]
  const counts = new Map<string, number>()
  for (const b of list)
    counts.set(b.neighborhood, (counts.get(b.neighborhood) ?? 0) + 1)
  // Bairro com mais bares primeiro; empate pelo nome.
  const neighborhoods = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
  const near = list
    .map((b) => b.km)
    .filter((k): k is number => k !== null)
    .sort((a, b) => a - b)[0]
  return { bars: list, neighborhoods, nearest: near ?? null }
}

export type BarSort = 'bairro' | 'perto' | 'az'

const byKm = (a: YourBar, b: YourBar) =>
  (a.km ?? Number.POSITIVE_INFINITY) - (b.km ?? Number.POSITIVE_INFINITY) ||
  a.name.localeCompare(b.name, 'pt-BR')

/**
 * A lista em grupos. "Bairro": um grupo por bairro, na ordem do resumo, do
 * mais perto ao mais longe dentro dele. "Perto" e "A–Z": um grupo só.
 */
export function barGroups(
  bars: YourBar[],
  neighborhoods: { name: string }[],
  sort: BarSort
) {
  if (sort === 'perto')
    return [{ key: 'perto', label: null, bars: [...bars].sort(byKm) }]
  if (sort === 'az')
    return [
      {
        key: 'az',
        label: null,
        bars: [...bars].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      }
    ]
  return neighborhoods.map((n) => ({
    key: n.name,
    label: n.name,
    bars: bars.filter((b) => b.neighborhood === n.name).sort(byKm)
  }))
}
