import { brasiliaWindows } from './limits'

/**
 * Contas da tela "IA" do Houdini, puras: o banco entrega as contagens
 * (`routers/houdini-ia.ts`).
 */

export const AI_PERIODS = ['today', '7d', '30d', 'month', 'all'] as const
export type AiPeriod = (typeof AI_PERIODS)[number]

const DAY_MS = 86_400_000

/**
 * Começo do período no calendário de Brasília: hoje, os últimos 7 ou 30 dias
 * contando hoje, o mês corrente, ou tudo (nulo).
 */
export function periodStart(period: AiPeriod, now: Date): Date | null {
  const w = brasiliaWindows(now)
  switch (period) {
    case 'today':
      return w.dayStart
    case '7d':
      return new Date(w.dayStart.getTime() - 6 * DAY_MS)
    case '30d':
      return new Date(w.dayStart.getTime() - 29 * DAY_MS)
    case 'month':
      return w.monthStart
    case 'all':
      return null
  }
}

/** Gasto do mês no ritmo de agora, até o fim do mês de Brasília. */
export function monthProjection(spentUsd: number, now: Date) {
  const w = brasiliaWindows(now)
  const elapsed = now.getTime() - w.monthStart.getTime()
  const length = w.nextMonth.getTime() - w.monthStart.getTime()
  return elapsed > 0 ? (spentUsd * length) / elapsed : 0
}

/** Dias de Brasília ('2026-10-21') de `from` até `now`, para o gráfico. */
export function brasiliaDays(from: Date, now: Date) {
  const days: string[] = []
  const last = brasiliaWindows(now).dayStart.getTime()
  for (let t = brasiliaWindows(from).dayStart.getTime(); t <= last; t += DAY_MS)
    days.push(new Date(t).toISOString().slice(0, 10))
  return days
}

/**
 * Mínimo para comparar a conversão de dois braços: 100 conversas em cada um e
 * pelo menos 5 com ação e 5 sem ação em cada. Abaixo disso a aproximação
 * normal do teste de duas proporções não vale, e o intervalo mentiria.
 */
export const MIN_CONVERSATIONS = 100
export const MIN_OUTCOMES = 5

export type Arm = { conversations: number; conversions: number }

export type ConversionDiff =
  | { enough: false; missing: string }
  | {
      enough: true
      /** B menos A, em pontos de proporção (0,05 = 5 p.p.). */
      diff: number
      low: number
      high: number
      /** O intervalo de 95% não cruza o zero. */
      significant: boolean
    }

/**
 * Diferença de conversão B − A com intervalo de 95% (teste de duas
 * proporções, erro padrão sem agrupar). Devolve o que falta enquanto a
 * amostra for pequena.
 */
export function conversionDiff(a: Arm, b: Arm): ConversionDiff {
  for (const [name, arm] of [
    ['A', a],
    ['B', b]
  ] as const) {
    if (arm.conversations < MIN_CONVERSATIONS)
      return {
        enough: false,
        missing: `${name} tem ${arm.conversations} de ${MIN_CONVERSATIONS} conversas`
      }
    const without = arm.conversations - arm.conversions
    if (arm.conversions < MIN_OUTCOMES || without < MIN_OUTCOMES)
      return {
        enough: false,
        missing: `${name} precisa de ${MIN_OUTCOMES} conversas com ação e ${MIN_OUTCOMES} sem`
      }
  }
  const pa = a.conversions / a.conversations
  const pb = b.conversions / b.conversations
  const se = Math.sqrt(
    (pa * (1 - pa)) / a.conversations + (pb * (1 - pb)) / b.conversations
  )
  const diff = pb - pa
  const low = diff - 1.96 * se
  const high = diff + 1.96 * se
  return { enough: true, diff, low, high, significant: low > 0 || high < 0 }
}
