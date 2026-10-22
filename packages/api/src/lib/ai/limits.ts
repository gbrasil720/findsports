import type { AppConfigValue } from '../app-config/registry'

/**
 * Tetos e sorteio da IA (WEB-424, WEB-400), em funções puras: o banco só
 * entrega as contagens e os limites (`run.ts`).
 */

/**
 * Tetos e limites (`ai.limits` no `app_config`, editáveis no Houdini): o
 * gasto do mês de todo mundo (o Gateway de produção tem o mesmo teto), o
 * gasto do mês e as chamadas do dia por pessoa (inclusive as que falharam), e
 * as mensagens do chat com resposta útil (o que acabar primeiro).
 */
export type AiLimits = AppConfigValue<'ai.limits'>

/**
 * Começo do dia e do mês de Brasília que contém `now`, e o começo dos
 * seguintes. ponytail: fuso fixo em -03:00, o Brasil não tem horário de verão
 * desde 2019; se voltar, trocar pelo deslocamento do `Intl`.
 */
export function brasiliaWindows(now: Date) {
  const [y, m, d] = now
    .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    .split('-')
    .map(Number) as [number, number, number]
  const at = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month - 1, day, 3))
  return {
    dayStart: at(y, m, d),
    nextDay: at(y, m, d + 1),
    monthStart: at(y, m, 1),
    nextMonth: at(y, m + 1, 1)
  }
}

export type UserUsage = {
  /** Execuções de hoje, qualquer desfecho. */
  callsToday: number
  /** Mensagens do chat com resposta útil, hoje e no mês. */
  chatToday: number
  chatMonth: number
  /** Gasto da pessoa no mês e de todo mundo no mês. */
  userCostMonth: number
  totalCostMonth: number
}

export type AiBlock = 'budget' | 'user_budget' | 'user_daily'

/** Trava de gasto e de chamadas, para qualquer funcionalidade de IA. */
export function budgetBlock(
  usage: UserUsage,
  limits: AiLimits
): AiBlock | null {
  if (usage.totalCostMonth >= limits.monthlyBudgetUsd) return 'budget'
  if (usage.userCostMonth >= limits.userMonthlyUsd) return 'user_budget'
  if (usage.callsToday >= limits.userDailyCalls) return 'user_daily'
  return null
}

export type ChatAllowance =
  | { ok: true; remainingToday: number; remainingMonth: number }
  | { ok: false; scope: 'day' | 'month'; resumesAt: Date }

/**
 * Quanto do limite do chat sobra e, no limite, quando ele volta: amanhã à
 * meia-noite de Brasília ou no dia 1º. A trava de chamadas por dia também
 * volta amanhã; a de gasto da pessoa, no mês seguinte.
 */
export function chatAllowance(
  usage: UserUsage,
  now: Date,
  limits: AiLimits
): ChatAllowance {
  const w = brasiliaWindows(now)
  if (
    usage.chatMonth >= limits.chatMonthlyMessages ||
    usage.userCostMonth >= limits.userMonthlyUsd
  )
    return { ok: false, scope: 'month', resumesAt: w.nextMonth }
  if (
    usage.chatToday >= limits.chatDailyMessages ||
    usage.callsToday >= limits.userDailyCalls
  )
    return { ok: false, scope: 'day', resumesAt: w.nextDay }
  return {
    ok: true,
    remainingToday: limits.chatDailyMessages - usage.chatToday,
    remainingMonth: limits.chatMonthlyMessages - usage.chatMonth
  }
}

/** FNV-1a de 32 bits: estável entre execuções, sem depender de crypto. */
function hash(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Braço do teste para a pessoa: hash do id com o nome do teste, numa faixa
 * dividida pelos pesos. A mesma pessoa cai sempre no mesmo braço
 * enquanto os pesos não mudam. Todos os pesos em zero caem no primeiro.
 */
export function assignVariant<V extends string>(
  userId: string,
  experiment: string,
  weights: Record<V, number>
): V {
  const arms = Object.keys(weights).sort() as V[]
  const total = arms.reduce((sum, arm) => sum + weights[arm], 0)
  if (total <= 0) return arms[0] as V
  let slot = (hash(`${experiment}:${userId}`) % 10_000) / 10_000
  for (const arm of arms) {
    slot -= weights[arm] / total
    if (slot < 0) return arm
  }
  return arms[arms.length - 1] as V
}
