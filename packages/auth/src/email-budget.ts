import {
  incrementWindow,
  refundWindowAttempt
} from '@findsports_oficial/db/rate-limit'

/**
 * Quem gasta a cota do provedor de e-mail. `auth` é verificação e reset: sem
 * eles ninguém entra, então só eles chegam ao fim do orçamento do dia.
 */
export type EmailCategory = 'auth' | 'feedback' | 'export' | 'notices'

/**
 * Orçamento dos envios, abaixo da cota da conta da MillionSend (plano Free,
 * 100 por dia, na mesma `EMAIL_API_KEY` para todos os envios). O dia é o de
 * UTC, que é como a cota do provedor costuma virar.
 */
export const EMAIL_BUDGET = {
  /** Total do dia, todas as categorias. */
  daily: 90,
  /** Só `auth` passa de `daily - authReserve`: o resto não esgota a entrada. */
  authReserve: 30,
  /** Teto do dia por categoria, além do total. */
  categoryDaily: { feedback: 10, export: 10 } as Partial<
    Record<EmailCategory, number>
  >,
  /** Verificação e reset para o mesmo endereço. */
  perRecipient: { max: 3, windowMs: 60 * 60_000 }
} as const

const DAY_MS = 24 * 60 * 60_000

/** Prefixo das chaves do dia em `rate_limit` (`email:day:<AAAA-MM-DD>`). */
export function emailBudgetDay(now: Date): string {
  return `email:day:${now.toISOString().slice(0, 10)}`
}

export type EmailBudgetScope = 'recipient' | 'category' | 'daily' | 'provider'

/** Envio recusado pelo orçamento (ou o provedor disse que a cota acabou). */
export class EmailBudgetExceeded extends Error {
  constructor(
    readonly category: EmailCategory,
    readonly scope: EmailBudgetScope
  ) {
    super(`Orçamento de e-mail esgotado (${category}, ${scope}).`)
    this.name = 'EmailBudgetExceeded'
  }
}

export type ReserveEmail = (
  category: EmailCategory,
  to: string
) => Promise<void>

/**
 * Conta um envio antes de chamar o provedor e lança `EmailBudgetExceeded` se
 * passar de algum teto. A tentativa recusada é devolvida em todos os
 * contadores, para não gastar o orçamento de quem vem depois.
 */
export async function reserveEmailSend(
  category: EmailCategory,
  to: string,
  now = new Date()
): Promise<void> {
  const day = emailBudgetDay(now)
  const checks: {
    key: string
    max: number
    windowMs: number
    scope: EmailBudgetScope
  }[] = []
  if (category === 'auth') {
    checks.push({
      key: `email:to:${to.trim().toLowerCase()}`,
      ...EMAIL_BUDGET.perRecipient,
      scope: 'recipient'
    })
  }
  const categoryMax = EMAIL_BUDGET.categoryDaily[category]
  if (categoryMax !== undefined) {
    checks.push({
      key: `${day}:${category}`,
      max: categoryMax,
      windowMs: DAY_MS,
      scope: 'category'
    })
  }
  checks.push({
    key: day,
    max:
      category === 'auth'
        ? EMAIL_BUDGET.daily
        : EMAIL_BUDGET.daily - EMAIL_BUDGET.authReserve,
    windowMs: DAY_MS,
    scope: 'daily'
  })

  const taken: string[] = []
  for (const check of checks) {
    const attempt = await incrementWindow(check.key, check)
    taken.push(check.key)
    if (!attempt.allowed) {
      await Promise.all(taken.map((key) => refundWindowAttempt(key)))
      console.warn(
        JSON.stringify({
          event: 'email_budget_refused',
          category,
          scope: check.scope
        })
      )
      throw new EmailBudgetExceeded(category, check.scope)
    }
  }
}
