import { db, sql } from '@findsports_oficial/db'
import {
  brasiliaDay,
  brasiliaDayStart
} from '@findsports_oficial/db/event-window'
import { utcIso } from '../utc-timestamp'
import { pctChange } from './types'

/*
 * "Interesse acima do seu normal de segunda" (Hoje, 1r; WEB-449): quantas
 * pessoas se interessaram pelo bar hoje (WhatsApp, rota ou telefone) contra a
 * média das últimas segundas na mesma janela, da meia-noite até a hora de
 * agora. Hoje à tarde contra a segunda inteira daria sempre "abaixo".
 *
 * Quatro semanas cabem no histórico do Starter (30 dias), então o número vale
 * para todos os planos sem ler o que o plano não vê. Semana de antes de o bar
 * existir não entra na média: é zero que não é o normal de ninguém.
 */
export const WEEKDAY_INTEREST_WEEKS = 4
/** Com uma semana só, "o seu normal" seria um dia qualquer. */
export const WEEKDAY_INTEREST_MIN_WEEKS = 2

const DAY_MS = 24 * 60 * 60 * 1000

export type WeekdayInterest = {
  day: string
  /** Pessoas interessadas no dia, até agora. */
  interestedPeople: number
  /** Média das mesmas janelas nas semanas anteriores; `null` sem histórico. */
  normal: number | null
  /** `null` sem histórico ou com normal zero e interesse hoje. */
  changePercent: number | null
  /** Quantas semanas entraram na média. */
  weeks: number
}

/**
 * A conta, sem banco: `porSemana[k]` são as pessoas interessadas `k` semanas
 * antes de `day` (0 é o próprio dia).
 */
export function weekdayInterest(
  day: string,
  porSemana: number[],
  barCreatedDay: string
): WeekdayInterest {
  const interestedPeople = porSemana[0] ?? 0
  const anteriores = porSemana
    .slice(1)
    .filter(
      (_, i) => brasiliaDay(`${day}T15:00:00Z`, -7 * (i + 1)) > barCreatedDay
    )
  if (anteriores.length < WEEKDAY_INTEREST_MIN_WEEKS) {
    return {
      day,
      interestedPeople,
      normal: null,
      changePercent: null,
      weeks: anteriores.length
    }
  }
  const normal = anteriores.reduce((s, v) => s + v, 0) / anteriores.length
  return {
    day,
    interestedPeople,
    normal: Math.round(normal * 10) / 10,
    changePercent: pctChange(interestedPeople, normal),
    weeks: anteriores.length
  }
}

/** Lê do banco as janelas de `day` e das quatro semanas antes e faz a conta. */
export async function getWeekdayInterest(
  barId: string,
  day: string,
  now = new Date()
): Promise<WeekdayInterest> {
  const inicio = brasiliaDayStart(day)
  const fim = Math.min(now.getTime(), inicio.getTime() + DAY_MS)
  const segundos = Math.max(0, (fim - inicio.getTime()) / 1000)

  const result = await db.execute(sql`
    WITH semanas AS (
      SELECT k, ${inicio.toISOString()}::timestamptz - make_interval(days => 7 * k) AS ini
      FROM generate_series(0, ${WEEKDAY_INTEREST_WEEKS}) AS k
    )
    SELECT
      s.k,
      COUNT(DISTINCT e.actor_user_id) AS pessoas,
      (SELECT created_at FROM bar WHERE id = ${barId}) AS criado_em
    FROM semanas s
    LEFT JOIN bar_commercial_event e
      ON e.bar_id = ${barId}
      AND e.type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened')
      AND e.occurred_at >= s.ini
      AND e.occurred_at < s.ini + make_interval(secs => ${segundos})
    GROUP BY s.k
    ORDER BY s.k
  `)

  const rows = result.rows as Array<{
    k: number | string
    pessoas: number | string
    criado_em: string | Date
  }>
  return weekdayInterest(
    day,
    rows.map((r) => Number(r.pessoas)),
    brasiliaDay(rows[0] ? utcIso(rows[0].criado_em) : now)
  )
}
