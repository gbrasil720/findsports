import {
  brasiliaDay,
  brasiliaDayStart
} from '@findsports_oficial/db/event-window'
import type { RecommendationFacts } from './facts'
import type {
  RecommendationAxes,
  RecommendationReason,
  RecommendationSlot
} from './ranking'

/*
 * A rodada diária do app (WEB-425): até cinco bares por dia, e a próxima
 * rodada às 10:00 de Brasília (dono, 21/10/2026). Contas puras; a leitura e
 * a gravação ficam no roteador `recommendations`.
 */

export const ROUND_SIZE = 5
/** A hora de Brasília em que a rodada vira. */
export const ROUND_TURN_HOUR = 10
const HOUR_MS = 3_600_000

/** O dia da rodada ("2026-10-21"): antes das 10:00 ainda vale a de ontem. */
export function roundDay(now: Date): string {
  return brasiliaDay(now.getTime() - ROUND_TURN_HOUR * HOUR_MS)
}

/** Quando a próxima rodada abre: 10:00 de Brasília do dia seguinte ao da rodada. */
export function nextRoundAt(now: Date): Date {
  const next = brasiliaDay(brasiliaDayStart(roundDay(now)), 1)
  return new Date(brasiliaDayStart(next).getTime() + ROUND_TURN_HOUR * HOUR_MS)
}

/** O que a rodada guarda de cada bar: a conta do momento em que saiu. */
export type RoundItem = {
  barId: string
  name: string
  neighborhood: string
  photoUrl: string | null
  latitude: string
  longitude: string
  distanceKm: number
  position: number
  slot: RecommendationSlot
  score: number
  axes: RecommendationAxes
  reason: RecommendationReason
  isExpandedRadius: boolean
  facts: RecommendationFacts
}

export type RoundDecision = 'liked' | 'passed' | null
