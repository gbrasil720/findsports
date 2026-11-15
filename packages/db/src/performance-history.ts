import { brasiliaDay, hasEventEnded } from './event-window'

/*
 * O Desempenho de um bar com pouca história (WEB-467), no web e no app: em
 * que momento o bar está (sem jogo, antes do primeiro jogo, já jogou), quando
 * a comparação com o período anterior passa a valer e de que dia o gráfico
 * começa. Sem imports além do relógio do jogo: o app também lê.
 */

type Game = {
  startsAt: string | Date
  endsAt: string | Date | null
  publishedAt: string | Date | null
}

export type PerformanceStage<T> =
  | { kind: 'no-games' }
  | { kind: 'before-first'; game: T }
  | { kind: 'played' }

/** Rascunho não conta: o bar só tem jogo depois de publicar. */
export function performanceStage<T extends Game>(
  games: readonly T[],
  now: number = Date.now()
): PerformanceStage<T> {
  const published = games.filter((game) => game.publishedAt)
  if (published.some((game) => hasEventEnded(game, now)))
    return { kind: 'played' }
  const [first] = [...published].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )
  return first ? { kind: 'before-first', game: first } : { kind: 'no-games' }
}

/**
 * O dia (de Brasília) em que a comparação de `days` dias passa a valer: o
 * período anterior inteiro depois da criação do bar, criação + 2 períodos.
 * Nulo quando ela já vale (antes, "vs 30 dias antes" comparava com dias em
 * que o bar não existia).
 */
export function comparisonStartsOn(
  createdAt: string | Date,
  days: number,
  now: number = Date.now()
): string | null {
  const day = brasiliaDay(createdAt, days * 2)
  return day > brasiliaDay(now) ? day : null
}

/** A série diária a partir do dia em que o bar entrou no ar. */
export function sinceLive<P extends { date: string }>(
  points: readonly P[],
  createdAt: string | Date
): P[] {
  const first = brasiliaDay(createdAt)
  return points.filter((point) => point.date >= first)
}

/** "27h 05", "45min": até o jogo, sem segundos (muda a cada minuto). */
export function untilGame(
  startsAt: string | Date,
  now: number = Date.now()
): { value: string; unit: string } {
  const minutes = Math.max(
    0,
    Math.floor((new Date(startsAt).getTime() - now) / 60_000)
  )
  if (minutes < 60) return { value: String(minutes), unit: 'min' }
  return {
    value: String(Math.floor(minutes / 60)),
    unit: `h ${String(minutes % 60).padStart(2, '0')}`
  }
}
