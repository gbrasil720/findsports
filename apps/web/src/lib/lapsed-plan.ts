import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'

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
