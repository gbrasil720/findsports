import { fold } from '@findsports_oficial/db/catalog/fold'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDay
} from '@findsports_oficial/db/event-window'

/*
 * Ordem e motivo das sugestões do catálogo (WEB-433), sem banco: quanto o
 * jogo combina com o histórico do bar (campeonato, times, dia e hora em que
 * ele costuma ter jogo), quantos torcedores dos times há na cidade e quantos
 * bares do bairro já publicaram o mesmo jogo.
 */

/** Abaixo disso a contagem de torcedores não sai (a tela mostra "—"). */
export const FANS_FLOOR = 10

export type HistoryEvent = {
  sportId: string
  championship: string
  startsAt: Date
  teams: { id: string; name: string }[]
}

export type BarHistory = {
  /** Times da casa (`bar_team`), id → nome: pesam mais que o histórico. */
  houseTeams: Map<string, string>
  championships: Map<string, number>
  teams: Map<string, { name: string; count: number }>
  sports: Set<string>
  /** "3|21": quarta, 21 h, no relógio de Brasília. */
  slots: Map<string, number>
}

export type CatalogCandidate = {
  id: string
  sportId: string
  championship: string
  title: string
  startsAt: Date
  homeTeamId: string | null
  awayTeamId: string | null
  channels: string[]
  channelConfirmed: boolean
  /** Contagem crua; só sai se passar do piso (`FANS_FLOOR`). */
  fans: number
  barsInNeighborhood: number
}

const hourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: BRASILIA_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23'
})

/** Dia da semana (0 = domingo) e hora de Brasília. */
export function brasiliaSlot(at: Date) {
  const weekday = new Date(`${brasiliaDay(at)}T12:00:00Z`).getUTCDay()
  return { weekday, hour: Number(hourFormat.format(at)) }
}

export function barHistory(
  events: readonly HistoryEvent[],
  houseTeams: ReadonlyMap<string, string> = new Map()
): BarHistory {
  const history: BarHistory = {
    houseTeams: new Map(houseTeams),
    championships: new Map(),
    teams: new Map(),
    sports: new Set(),
    slots: new Map()
  }
  for (const e of events) {
    const c = fold(e.championship)
    history.championships.set(c, (history.championships.get(c) ?? 0) + 1)
    history.sports.add(e.sportId)
    for (const team of e.teams) {
      const prev = history.teams.get(team.id)
      history.teams.set(team.id, {
        name: team.name,
        count: (prev?.count ?? 0) + 1
      })
    }
    const { weekday, hour } = brasiliaSlot(e.startsAt)
    const slot = `${weekday}|${hour}`
    history.slots.set(slot, (history.slots.get(slot) ?? 0) + 1)
  }
  return history
}

/** Jogos no mesmo dia da semana, até uma hora antes ou depois. */
function slotCount(history: BarHistory, at: Date) {
  const { weekday, hour } = brasiliaSlot(at)
  return [hour - 1, hour, hour + 1].reduce(
    (sum, h) => sum + (history.slots.get(`${weekday}|${h}`) ?? 0),
    0
  )
}

const WEEKDAYS = [
  'aos domingos',
  'às segundas',
  'às terças',
  'às quartas',
  'às quintas',
  'às sextas',
  'aos sábados'
]

/** O time da casa que joga (o mandante primeiro), pelo nome. */
export function houseTeamOf(history: BarHistory, game: CatalogCandidate) {
  for (const id of [game.homeTeamId, game.awayTeamId]) {
    const name = id ? history.houseTeams.get(id) : undefined
    if (name) return name
  }
  return null
}

function teamOf(history: BarHistory, game: CatalogCandidate) {
  return [game.homeTeamId, game.awayTeamId]
    .flatMap((id) => (id ? [history.teams.get(id)] : []))
    .filter((t) => t !== undefined)
    .sort((a, b) => b.count - a.count)[0]
}

/** Bar sem jogo publicado e sem time da casa: nada do histórico pesa. */
function isNewBar(history: BarHistory) {
  return history.sports.size === 0 && history.houseTeams.size === 0
}

// ponytail: pelo nome do campeonato e do título; uma coluna de país no
// catálogo resolve de vez se a lista de nomes começar a errar.
const BRAZILIAN_CLUB_COMPETITIONS =
  /brasileir|copa do brasil|libertadores|sul-americana|paulist|carioca|mineiro|gauch|baian|pernambuc|cearense|paranaense|catarinense|goian/
const OPEN_TV = new Set([
  'globo',
  'band',
  'record',
  'sbt',
  'cazetv',
  'tv cultura',
  'redetv'
])

/**
 * Para o bar novo, o que todo bar brasileiro passa: a seleção, depois clube
 * brasileiro, e o que está na TV aberta. Sem isso, tudo empata e o destaque
 * vira o jogo mais cedo, mesmo que seja um da NBA no League Pass.
 */
function newBarBonus(game: CatalogCandidate) {
  let bonus = 0
  if (/\bbrasil\b/.test(fold(game.title))) bonus += 3
  else if (BRAZILIAN_CLUB_COMPETITIONS.test(fold(game.championship))) bonus += 2
  if (game.channels.some((c) => OPEN_TV.has(fold(c)))) bonus += 1
  return bonus
}

export function scoreGame(history: BarHistory, game: CatalogCandidate) {
  const championship = history.championships.get(fold(game.championship)) ?? 0
  const team = teamOf(history, game)
  const slots = slotCount(history, game.startsAt)
  let score = 0
  // O bar disse que é a casa desse time: vem antes de qualquer histórico.
  score += houseTeamOf(history, game) ? 8 : 0
  score += championship ? 1.5 + Math.min(championship, 5) * 0.3 : 0
  score += team ? 2 + Math.min(team.count, 5) * 0.4 : 0
  score += history.sports.has(game.sportId) ? 1 : 0
  score += Math.min(slots, 4) * 0.5
  score += game.fans >= FANS_FLOOR ? Math.min(game.fans / 50, 2) : 0
  score +=
    game.barsInNeighborhood === 0
      ? 1
      : -0.5 * Math.min(game.barsInNeighborhood, 3)
  score += game.channels.length ? 0.3 : 0
  if (isNewBar(history)) score += newBarBonus(game)
  return score
}

/** Uma frase curta, do histórico do próprio bar; nula sem motivo. */
export function reasonFor(history: BarHistory, game: CatalogCandidate) {
  const house = houseTeamOf(history, game)
  if (house)
    return game.barsInNeighborhood === 0
      ? `Do ${house}, que você marcou, e ninguém do bairro passa ainda`
      : `Do ${house}, que você marcou`
  const team = teamOf(history, game)
  if (team)
    return team.count > 1
      ? `Você já passou ${team.count} jogos do ${team.name}`
      : `Você já passou jogo do ${team.name}`
  const championship = history.championships.get(fold(game.championship)) ?? 0
  if (championship > 1) return `Você costuma passar ${game.championship}`
  if (championship === 1) return `Você já passou jogo de ${game.championship}`
  if (slotCount(history, game.startsAt) >= 2) {
    const { weekday, hour } = brasiliaSlot(game.startsAt)
    return `Seu bar costuma ter jogo ${WEEKDAYS[weekday]} por volta das ${hour}h`
  }
  if (game.barsInNeighborhood === 0) return 'Seria o único do bairro'
  return null
}

export type RankedGame = CatalogCandidate & {
  /** O time da casa que joga ("Seu time" no card); nulo sem ele. */
  houseTeam: string | null
  fansInCity: number | null
  reason: string | null
  featured: boolean
}

/** Os `limit` que mais combinam com o bar; o primeiro é o destaque. */
export function rankCatalogGames(
  history: BarHistory,
  games: readonly CatalogCandidate[],
  limit: number
): RankedGame[] {
  return games
    .map((game) => ({ game, score: scoreGame(history, game) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.game.startsAt.getTime() - b.game.startsAt.getTime()
    )
    .slice(0, limit)
    .map(({ game }, i) => ({
      ...game,
      houseTeam: houseTeamOf(history, game),
      fansInCity: game.fans >= FANS_FLOOR ? game.fans : null,
      reason: reasonFor(history, game),
      featured: i === 0
    }))
}
