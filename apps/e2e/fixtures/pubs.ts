import { randomUUID } from 'node:crypto'
import { SAO_PAULO } from '../env'
import { insert } from './db'
import { createUser, type TestUser, type UserOptions } from './users'

export type Plan = 'starter' | 'pro' | 'elite'
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'inactive'
  | 'past_due'
  | 'cancelled'

export type PubOptions = {
  user?: Omit<UserOptions, 'role'>
  /** `null` cria o bar sem assinatura. Padrão: Elite ativa por 30 dias. */
  subscription?: {
    plan?: Plan
    status?: SubscriptionStatus
    currentPeriodEnd?: Date | null
    /** Id da assinatura no Stripe; presente, a linha é do provedor. */
    externalSubscriptionId?: string
    /** Desconto mensal em reais gravado pelo webhook; omitido = null. */
    monthlyDiscountReais?: number | null
  } | null
  /** Colunas de `bar` em snake_case, por cima dos padrões. */
  bar?: Record<string, unknown>
}

export type TestPub = { user: TestUser; barId: string }

export const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

/**
 * Dono (papel pub, onboarding feito) + bar ativo no centro de São Paulo +
 * assinatura. `bar.plan` acompanha o plano vigente dela por trigger do banco.
 */
export async function createPub(options: PubOptions = {}): Promise<TestPub> {
  const user = await createUser({ ...options.user, role: 'pub' })
  const barId = randomUUID()

  await insert('bar', {
    id: barId,
    user_id: user.id,
    name: `Bar E2E ${barId.slice(0, 8)}`,
    address: 'Rua Augusta, 100',
    neighborhood: 'Consolação',
    city: 'São Paulo',
    latitude: SAO_PAULO.latitude,
    longitude: SAO_PAULO.longitude,
    is_active: true,
    ...options.bar
  })

  if (options.subscription !== null) {
    const sub = options.subscription ?? {}
    await insert('subscription', {
      id: randomUUID(),
      bar_id: barId,
      plan: sub.plan ?? 'elite',
      status: sub.status ?? 'active',
      current_period_end:
        sub.currentPeriodEnd === undefined ? inDays(30) : sub.currentPeriodEnd,
      provider: sub.externalSubscriptionId ? 'stripe' : null,
      external_subscription_id: sub.externalSubscriptionId ?? null,
      monthly_discount_reais:
        sub.monthlyDiscountReais === undefined ? null : sub.monthlyDiscountReais
    })
  }

  return { user, barId }
}
