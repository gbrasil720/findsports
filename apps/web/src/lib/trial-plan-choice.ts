/**
 * O bar que foi ao ar pelo cadastro e ainda não escolheu o plano do teste é
 * levado à escolha antes do painel (`/onboarding/pub/no-ar?passo=plano`). A
 * escolha é o `pub.changeTrialPlan`, que só vale no teste do cadastro: com
 * assinatura no Stripe, teste vencido ou plano pago não há o que escolher ali,
 * e o painel abre normalmente (o bar de antes já nasce com a data gravada).
 */
export function precisaEscolherPlano(
  bar: { trialPlanChosenAt: Date | string | null },
  subscription: {
    status: string
    externalSubscriptionId: string | null
    currentPeriodEnd: Date | string | null
  } | null,
  now = Date.now()
): boolean {
  if (bar.trialPlanChosenAt !== null || !subscription) return false
  return (
    subscription.status === 'trialing' &&
    subscription.externalSubscriptionId === null &&
    subscription.currentPeriodEnd !== null &&
    new Date(subscription.currentPeriodEnd).getTime() > now
  )
}
