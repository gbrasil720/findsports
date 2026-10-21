/**
 * Tetos e sorteio da IA (WEB-424, WEB-400), em funções puras: o banco só
 * entrega as contagens (`run.ts`).
 */

/** Teto do mês, todo mundo junto. O Gateway de produção tem o mesmo teto. */
export const MONTHLY_BUDGET_USD = 40
/** Por pessoa: gasto do mês e chamadas do dia, inclusive as que falharam. */
export const USER_MONTHLY_USD = 1.5
export const USER_DAILY_CALLS = 30
/** Mensagens do chat com resposta útil (o que acabar primeiro). */
export const CHAT_DAILY_MESSAGES = 10
export const CHAT_MONTHLY_MESSAGES = 100

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
export function budgetBlock(usage: UserUsage): AiBlock | null {
  if (usage.totalCostMonth >= MONTHLY_BUDGET_USD) return 'budget'
  if (usage.userCostMonth >= USER_MONTHLY_USD) return 'user_budget'
  if (usage.callsToday >= USER_DAILY_CALLS) return 'user_daily'
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
export function chatAllowance(usage: UserUsage, now: Date): ChatAllowance {
  const w = brasiliaWindows(now)
  if (
    usage.chatMonth >= CHAT_MONTHLY_MESSAGES ||
    usage.userCostMonth >= USER_MONTHLY_USD
  )
    return { ok: false, scope: 'month', resumesAt: w.nextMonth }
  if (
    usage.chatToday >= CHAT_DAILY_MESSAGES ||
    usage.callsToday >= USER_DAILY_CALLS
  )
    return { ok: false, scope: 'day', resumesAt: w.nextDay }
  return {
    ok: true,
    remainingToday: CHAT_DAILY_MESSAGES - usage.chatToday,
    remainingMonth: CHAT_MONTHLY_MESSAGES - usage.chatMonth
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
