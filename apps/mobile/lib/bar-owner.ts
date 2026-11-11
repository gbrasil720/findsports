import {
  brasiliaDay,
  hasEventEnded,
  isEventLive
} from '@findsports_oficial/db/event-window'

/*
 * Contas do app do dono do bar (rodada 10): o dia da casa, o estado de cada
 * jogo e as frases curtas de "Chegaram agora". Sem React, para o teste.
 */

type Times = { startsAt: string | Date; endsAt: string | Date | null }

export type GameState = 'live' | 'upcoming' | 'ended' | 'draft'

export function gameState(
  game: Times & { publishedAt: string | Date | null },
  now: number
): GameState {
  if (!game.publishedAt) return 'draft'
  if (isEventLive(game, now)) return 'live'
  if (hasEventEnded(game, now)) return 'ended'
  return 'upcoming'
}

/** Os jogos de hoje na casa (dia de Brasília), mais o ao vivo que veio de ontem. */
export function todayGames<
  T extends Times & { publishedAt: string | Date | null }
>(games: readonly T[], now: number): T[] {
  const today = brasiliaDay(now)
  return games
    .filter((game) => game.publishedAt)
    .filter(
      (game) => brasiliaDay(game.startsAt) === today || isEventLive(game, now)
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
}

/**
 * "primeira vez no bar" ou "4ª vez no mês": a visita de hoje já conta (o
 * código validado é a visita).
 */
export function visitLine(arrival: {
  firstVisit: boolean
  visitsThisMonth: number
}): string {
  if (arrival.firstVisit) return 'primeira vez no bar'
  return `${arrival.visitsThisMonth}ª vez no mês`
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const WEEKDAY_NAMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado'
]
const MONTHS = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ'
]

/** O dia de Brasília como data UTC ao meio-dia (sem o Intl, que o Hermes não parte). */
function houseDate(now: number) {
  return new Date(`${brasiliaDay(now)}T12:00:00Z`)
}

/** "SEG 12 OUT", em Brasília. */
export function dayKicker(now: number): string {
  const day = houseDate(now)
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

/** "de segunda", para "interesse acima do normal de segunda". */
export function weekdayName(now: number): string {
  return `de ${WEEKDAY_NAMES[houseDate(now).getUTCDay()]}`
}

/** "+18%", "−4%", ou nada sem base de comparação. */
export function delta(change: number | null | undefined): string | null {
  if (change === null || change === undefined || !Number.isFinite(change))
    return null
  const n = Math.round(change)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`
}
