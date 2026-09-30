import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { TRPCError } from '@trpc/server'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'

/**
 * Regras da oferta da casa (WEB-120) que dependem do plano.
 *
 * O plano vem da assinatura via `getCurrentPlan` — `active`, ou `trialing`
 * com período vigente — e nunca de `bar.plan`, que ignora o status.
 */

export function canConfigureHouseOffer(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): boolean {
  return getCurrentPlan(subscription, now) === 'elite'
}

/**
 * Esconder o formulário não é validação: o procedimento chama isto antes de
 * gravar, e a recusa vale para qualquer escrita — salvar, editar ou limpar.
 */
export function assertCanConfigureHouseOffer(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!canConfigureHouseOffer(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A oferta da casa é um recurso do plano Elite.'
    })
  }
}

/** Normaliza o texto recebido e aplica o limite sobre a forma gravada. */
export function parseHouseOfferInput(input: string | null): string | null {
  const value = normalizeHouseOffer(input)
  if (houseOfferLength(value) > HOUSE_OFFER_MAX_LENGTH) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `A oferta da casa aceita até ${HOUSE_OFFER_MAX_LENGTH} caracteres.`
    })
  }
  return value
}
