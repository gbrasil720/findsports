import {
  averageSpendCentsError,
  parseMenuUrl
} from '@findsports_oficial/db/bar-menu'
import { TRPCError } from '@trpc/server'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'

/**
 * Regras do cardápio e do gasto médio (WEB-39) que dependem do plano.
 *
 * Pro e Elite vigentes, pela assinatura via `getCurrentPlan` — `active`, ou
 * `trialing` com período vigente — e nunca por `bar.plan`, que só acompanha
 * o fim do trial uma vez por dia. É a única regra de elegibilidade: gravar e
 * exibir passam por aqui.
 */
export function canShowBarMenu(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): boolean {
  const plan = getCurrentPlan(subscription, now)
  return plan === 'pro' || plan === 'elite'
}

/**
 * Esconder o formulário não é validação: o procedimento chama isto antes de
 * gravar, e a recusa vale para qualquer escrita — salvar, editar ou limpar.
 */
export function assertCanConfigureBarMenu(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!canShowBarMenu(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cardápio e preço médio são recursos dos planos Pro e Elite.'
    })
  }
}

/** Normaliza o link recebido; `null` ou texto em branco removem. */
export function parseMenuUrlInput(input: string | null): string | null {
  const result = parseMenuUrl(input)
  if (!result.ok) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: result.error })
  }
  return result.url
}

/** Confere o valor em centavos; `null` remove. */
export function parseAverageSpendCentsInput(
  cents: number | null
): number | null {
  const error = averageSpendCentsError(cents)
  if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error })
  return cents
}

/**
 * O que o perfil público mostra. Sem Pro/Elite vigente, os dois viram `null` —
 * continuam gravados e voltam a aparecer se o plano voltar.
 */
export function resolvePublicBarMenu(
  stored: { menuUrl: string | null; averageSpendCents: number | null },
  subscription: SubscriptionForPlan | null,
  now = new Date()
): { menuUrl: string | null; averageSpendCents: number | null } {
  if (!canShowBarMenu(subscription, now)) {
    return { menuUrl: null, averageSpendCents: null }
  }
  return stored
}
