import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'

/**
 * Plano parado (WEB-141): contratado, sem efeito até a assinatura ser
 * regularizada. Quem decide é o servidor (`getSubscriptionStanding`); aqui só
 * o texto de cada motivo, para painel, assinatura e `/plan` dizerem o mesmo.
 */
export type LapsedStanding = Extract<
  SubscriptionStanding,
  'past_due' | 'trial_ended'
>

export function isLapsed(
  standing: SubscriptionStanding | null | undefined
): standing is LapsedStanding {
  return standing === 'past_due' || standing === 'trial_ended'
}

export const LAPSED_COPY: Record<
  LapsedStanding,
  { label: string; title: (planName: string) => string; cause: string }
> = {
  past_due: {
    label: 'Pagamento pendente',
    title: (planName) => `Plano ${planName} com pagamento pendente`,
    cause: 'O último pagamento não foi confirmado.'
  },
  trial_ended: {
    label: 'Trial encerrado',
    title: (planName) => `Trial do plano ${planName} encerrado`,
    cause: 'O trial gratuito terminou sem pagamento confirmado.'
  }
}

/**
 * Plano mostrado no painel (WEB-344): o gravado mais o pé da assinatura, para
 * a Visão geral, o Desempenho e `/admin/billing` contarem a mesma história.
 * Recurso pago continua decidindo por `currentPlan`. `note` acompanha o plano
 * em vigor onde ele aparece no lugar do gravado; `null` com o plano em dia.
 */
export function getShownPlan(
  subscription:
    | {
        plan: keyof typeof PLAN_NAMES
        standing: SubscriptionStanding | null
      }
    | null
    | undefined
): { name: string; label: string; note: string | null } {
  // Sem linha em `subscription`, o Starter de `bar.plan` é só o default da
  // coluna: não é plano contratado.
  if (!subscription?.standing) {
    return {
      name: 'Sem plano',
      label: 'Escolher um plano',
      note: 'Nenhuma assinatura ativa'
    }
  }
  const name = PLAN_NAMES[subscription.plan]
  if (subscription.standing === 'current') {
    return { name, label: 'Plano atual', note: null }
  }
  if (subscription.standing === 'ended') {
    return {
      name,
      label: 'Assinatura encerrada',
      note: `Assinatura do plano ${name} encerrada`
    }
  }
  const copy = LAPSED_COPY[subscription.standing]
  return { name, label: copy.label, note: copy.title(name) }
}

/**
 * Pro ou Elite parado cai no limite de jogos do Starter (WEB-129), e o que
 * destrava é regularizar a assinatura, não fazer upgrade (WEB-331). Devolve os
 * textos já com o nome do plano, ou `null` para quem segue lendo o aviso do
 * Starter: plano em dia e Starter parado, que continua no próprio limite.
 */
export function getLapsedPaidPlan(
  subscription:
    | {
        plan: keyof typeof PLAN_NAMES
        standing: SubscriptionStanding | null
      }
    | null
    | undefined
) {
  if (
    !subscription ||
    subscription.plan === 'starter' ||
    !isLapsed(subscription.standing)
  ) {
    return null
  }
  const copy = LAPSED_COPY[subscription.standing]
  return { ...copy, title: copy.title(PLAN_NAMES[subscription.plan]) }
}
