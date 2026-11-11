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

/**
 * Jogo lotando: passou de 20 marcações, a mesma regra do e-mail "Jogo
 * lotando" (`packages/api/src/lib/bar-notices.ts`).
 */
export const LOTANDO = 21

/** Os sete dias da casa a partir de hoje ("2026-11-11", ...). */
export function weekDays(now: number): string[] {
  return Array.from({ length: 7 }, (_, i) => brasiliaDay(now, i))
}

/** "há 2 h", "há 40 min", "há 3 d". */
export function sinceLabel(at: string | Date, now: number): string {
  const minutes = Math.max(
    1,
    Math.round((now - new Date(at).getTime()) / 60_000)
  )
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`
}

/**
 * As chegadas por hora de Brasília, da hora antes do jogo até a última
 * chegada (no mínimo quatro horas), para o gráfico do Quem vai.
 */
export function arrivalsByHour(
  times: readonly (string | Date)[],
  startsAt: string | Date
): { hour: number; count: number }[] {
  const hourOf = (at: string | Date) => (new Date(at).getUTCHours() + 21) % 24
  const start = (hourOf(startsAt) + 23) % 24
  const counts = new Map<number, number>()
  let last = 3
  for (const at of times) {
    const offset = (hourOf(at) - start + 24) % 24
    counts.set(offset, (counts.get(offset) ?? 0) + 1)
    last = Math.max(last, offset)
  }
  return Array.from({ length: last + 1 }, (_, i) => ({
    hour: (start + i) % 24,
    count: counts.get(i) ?? 0
  }))
}
