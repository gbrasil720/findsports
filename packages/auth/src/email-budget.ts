import { db, eq } from '@findsports_oficial/db'
import {
  incrementWindow,
  refundWindowAttempt
} from '@findsports_oficial/db/rate-limit'
import { rateLimit } from '@findsports_oficial/db/schema/auth'

/**
 * Quem gasta a cota do provedor de e-mail. `signup` é a verificação que sai
 * no cadastro (endereço novo); `verify` é a de conta que já existe (reenvio,
 * login sem verificar, admin); `reset` é a redefinição de senha.
 */
export type EmailCategory =
  | 'signup'
  | 'verify'
  | 'reset'
  | 'notices'
  | 'feedback'
  | 'export'

/** As que qualquer um dispara sem login, e por isso contam por IP. */
const PUBLIC_CATEGORIES: ReadonlySet<EmailCategory> = new Set([
  'signup',
  'verify',
  'reset'
])

/**
 * Orçamento dos envios, abaixo da cota da conta da MillionSend (plano Free,
 * 100 por dia, na mesma `EMAIL_API_KEY` para todos os envios). O dia é o de
 * UTC, que é como a cota do provedor costuma virar.
 *
 * Cada categoria tem o seu balde do dia, e a soma não passa de `daily`: um
 * flood de cadastro não come o reset nem os avisos da segunda, e o
 * provedor nunca chega à cota por nós.
 */
export const EMAIL_BUDGET = {
  daily: 90,
  categoryDaily: {
    signup: 25,
    verify: 15,
    reset: 15,
    notices: 25,
    feedback: 5,
    export: 5
  } satisfies Record<EmailCategory, number>,
  /**
   * Cadastro, verificação e reset do mesmo IP no dia, somados. Abaixo do
   * menor balde público: esgotar um pede vários IPs, além do captcha.
   */
  perIpDaily: 5,
  /**
   * Verificação e reset para o mesmo endereço **a partir do mesmo IP**, por
   * categoria. Contar só pelo endereço deixaria outra pessoa travar o reset
   * da vítima; o pedido da vítima, de outro IP, passa. Cadastrar, entrar
   * duas vezes sem verificar e reenviar cabe (o cadastro conta à parte).
   */
  perRecipient: { max: 3, windowMs: 60 * 60_000 }
} as const

const DAY_MS = 24 * 60 * 60_000

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Prefixo das chaves dos baldes do dia em `rate_limit`. */
export function emailBudgetDay(now: Date): string {
  return `email:day:${utcDay(now)}`
}

export type EmailBudgetScope = 'recipient' | 'ip' | 'category' | 'provider'

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
  to: string,
  ip?: string
) => Promise<void>

/**
 * Conta um envio antes de chamar o provedor e lança `EmailBudgetExceeded` se
 * passar de algum teto. A tentativa recusada é devolvida em todos os
 * contadores, para não gastar o orçamento de quem vem depois. Sem IP
 * (chamada do servidor, como o admin) só o balde da categoria conta.
 */
export async function reserveEmailSend(
  category: EmailCategory,
  to: string,
  ip?: string,
  now = new Date()
): Promise<void> {
  const checks: {
    key: string
    max: number
    windowMs: number
    scope: EmailBudgetScope
  }[] = []
  const knownIp = ip && ip !== 'unknown' ? ip : undefined
  if (knownIp && PUBLIC_CATEGORIES.has(category)) {
    if (category !== 'signup') {
      checks.push({
        key: `email:to:${category}:${to.trim().toLowerCase()}:${knownIp}`,
        ...EMAIL_BUDGET.perRecipient,
        scope: 'recipient'
      })
    }
    checks.push({
      key: `email:ip:${utcDay(now)}:${knownIp}`,
      max: EMAIL_BUDGET.perIpDaily,
      windowMs: DAY_MS,
      scope: 'ip'
    })
  }
  checks.push({
    key: `${emailBudgetDay(now)}:${category}`,
    max: EMAIL_BUDGET.categoryDaily[category],
    windowMs: DAY_MS,
    scope: 'category'
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

/**
 * O balde da categoria já acabou hoje? Para o admin, que manda pelo
 * better-auth (que engole o erro do envio) e precisa saber que não saiu.
 */
export async function emailCategoryExhausted(
  category: EmailCategory,
  now = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ count: rateLimit.count, lastRequest: rateLimit.lastRequest })
    .from(rateLimit)
    .where(eq(rateLimit.key, `${emailBudgetDay(now)}:${category}`))
  if (!row || now.getTime() - row.lastRequest >= DAY_MS) return false
  return row.count >= EMAIL_BUDGET.categoryDaily[category]
}
