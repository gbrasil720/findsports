import { brasiliaDay } from '@findsports_oficial/db/event-window'
import {
  type Achievement,
  computeAchievements,
  type Review,
  type Visit
} from './achievements'

/**
 * Ranking do mês (WEB-409, seção 13 do design). Nada fica gravado: sai das
 * visitas (`visits.ts`, código validado no balcão) a cada leitura, como as
 * conquistas. O mês é o de Brasília e vira todo dia 1º; a visita é do dia do
 * jogo (`event.starts_at`). Só regra pura aqui; a leitura do banco está em
 * `ranking-read.ts`.
 *
 * Métricas do design: bares diferentes (o padrão), jogos, bairros e
 * conquistas desbloqueadas no mês. Empate vai para quem chegou primeiro ao
 * número; sem nada no mês, pelo nome.
 */

export const RANKING_METRICS = [
  'bars',
  'games',
  'neighborhoods',
  'achievements'
] as const
export type RankingMetric = (typeof RANKING_METRICS)[number]

export type RankVisit = Visit & { eventId: string }

export type Score = {
  value: number
  /** Quando chegou ao número; nulo com zero. */
  reachedAt: Date | null
}

/** O placar de uma pessoa na métrica, contando o que aconteceu em [from, to). */
export function scoreOf(
  metric: RankingMetric,
  visits: RankVisit[],
  reviews: Review[],
  from: Date,
  to: Date
): Score {
  if (metric === 'achievements') {
    // A medalha precisa da história toda; conta a que saiu dentro do mês.
    const before = <T extends { at: Date }>(list: T[]) =>
      list.filter((item) => item.at < to)
    const unlocked = computeAchievements(before(visits), before(reviews))
      .map((a: Achievement) => a.unlockedAt)
      .filter((at): at is Date => !!at && at >= from && at < to)
    return {
      value: unlocked.length,
      reachedAt: unlocked.length
        ? new Date(Math.max(...unlocked.map((at) => at.getTime())))
        : null
    }
  }
  const key =
    metric === 'bars'
      ? (v: RankVisit) => v.barId
      : metric === 'games'
        ? (v: RankVisit) => v.eventId
        : // Bairro com o mesmo nome em outra cidade é outro bairro.
          (v: RankVisit) => `${v.city}\u0000${v.neighborhood}`
  const seen = new Set<string>()
  let reachedAt: Date | null = null
  for (const v of visits
    .filter((v) => v.at >= from && v.at < to)
    .sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const k = key(v)
    if (seen.has(k)) continue
    seen.add(k)
    reachedAt = v.at
  }
  return { value: seen.size, reachedAt }
}

/** Ordena e numera: mais alto primeiro; empate, quem chegou antes; depois o nome. */
export function rank<T extends { id: string; name: string; score: Score }>(
  people: T[]
) {
  const time = (s: Score) => s.reachedAt?.getTime() ?? Number.POSITIVE_INFINITY
  return [...people]
    .sort(
      (a, b) =>
        b.score.value - a.score.value ||
        time(a.score) - time(b.score) ||
        a.name.localeCompare(b.name, 'pt-BR') ||
        (a.id < b.id ? -1 : 1)
    )
    .map((person, index) => ({ ...person, position: index + 1 }))
}

/**
 * "Faltam 3 bares para passar Marina": quanto falta para quem está logo
 * acima. Empatar não basta, porque o empate fica com quem chegou antes.
 */
export function chaseOf(
  rows: { name: string; me: boolean; position: number; score: Score }[]
) {
  const me = rows.find((row) => row.me)
  const above = me && rows.find((row) => row.position === me.position - 1)
  if (!me || !above) return null
  return {
    name: above.name,
    need: above.score.value - me.score.value + 1,
    mine: me.score.value
  }
}

/** O mês de Brasília (`2026-10`) e quantos dias faltam para ele fechar. */
export function monthOf(now: Date) {
  const day = brasiliaDay(now)
  const [year, month, date] = day.split('-').map(Number) as [
    number,
    number,
    number
  ]
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { month: day.slice(0, 7), closesInDays: length - date }
}

/** A semana de comparação das setas (subiu, desceu), dentro do mês. */
export const MOVE_WINDOW_MS = 7 * 24 * 3_600_000

/**
 * A lista da cidade (27a, WEB-465). Só "Bares no mês" e "Jogos" (decisão do
 * dono, 28/10/2026); bairro, setas e a medalha Cidade ficaram para depois.
 */
export const CITY_METRICS = ['bars', 'games'] as const
export type CityMetric = (typeof CITY_METRICS)[number]
/** O top da primeira página e o tamanho de cada "ver mais". */
export const CITY_TOP = 8
export const CITY_PAGE = 30
/** Quantos acima e abaixo de você a vizinhança mostra. */
export const CITY_AROUND = 2

/**
 * Quem entra na lista da cidade: ligou "Aparecer no ranking global" (nasce
 * desligado) e não escolheu "Ninguém" em "Quem vê os bares que você validou".
 * Quem está fora não aparece para ninguém, nem vê a própria posição (27c).
 */
export const listedInCity = (
  rankingGlobal: boolean,
  visibility: 'everyone' | 'friends' | 'nobody'
) => rankingGlobal && visibility !== 'nobody'

/** Quantos torcedores da cidade têm cada valor no mês (o histograma). */
export type CityBucket = { value: number; count: number }

/** "TOP 17%": em que fatia da cidade a posição está, arredondado para cima. */
export const topPercent = (position: number, total: number) =>
  Math.max(1, Math.ceil((position / total) * 100))

/** O valor de quem está numa posição, lido do histograma (maior primeiro). */
function valueAt(buckets: CityBucket[], position: number) {
  let seen = 0
  for (const bucket of [...buckets].sort((a, b) => b.value - a.value)) {
    seen += bucket.count
    if (seen >= position) return bucket.value
  }
  return 0
}

/**
 * "Mais 1 bar e você sobe para o top 15%" (rodada 6): a próxima fatia de 5%
 * acima e quanto falta para passar quem está na beirada dela. Empatar não
 * basta (no empate, ganha quem chegou antes), então é o valor dela mais 1.
 * Já no top 5%, ou sem ninguém acima, nulo.
 */
export function cityChase(
  buckets: CityBucket[],
  position: number,
  total: number,
  mine: number
) {
  const now = topPercent(position, total)
  const top = Math.ceil(now / 5) * 5 - 5
  if (top < 5) return null
  const edge = Math.max(1, Math.floor((top / 100) * total))
  if (edge >= position) return null
  return { top, need: Math.max(1, valueAt(buckets, edge) - mine + 1) }
}

/**
 * O selo do mês (rodada 6): fecha o mês em 1º no ranking dos amigos quem tem
 * a posição 1 com pelo menos um bar e pelo menos um amigo na lista (sozinho
 * não é rei de nada). O empate já sai desfeito em `rank`.
 */
export function crownOf(
  rows: { me: boolean; position: number; value: number }[]
) {
  const me = rows.find((row) => row.me)
  return {
    won: !!me && me.position === 1 && me.value > 0 && rows.length > 1,
    value: me?.value ?? 0
  }
}

/** O mês anterior ao de `now` ("2026-10"), e o último instante dele. */
export function previousMonth(start: Date) {
  const end = new Date(start.getTime() - 1)
  return { end, month: monthOf(end).month }
}
