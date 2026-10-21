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
const TZ = 'America/Sao_Paulo'
const HOUR_MS = 3_600_000

/** O dia da rodada ("2026-10-21"): antes das 10:00 ainda vale a de ontem. */
export function roundDay(now: Date): string {
  return new Date(now.getTime() - ROUND_TURN_HOUR * HOUR_MS).toLocaleDateString(
    'en-CA',
    { timeZone: TZ }
  )
}

/**
 * Quando a próxima rodada abre. Brasília não tem horário de verão desde
 * 2019, então 10:00 de lá é sempre 13:00 UTC.
 */
export function nextRoundAt(now: Date): Date {
  const [year, month, day] = roundDay(now).split('-').map(Number)
  return new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1, ROUND_TURN_HOUR + 3)
  )
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
