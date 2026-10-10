import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'

type Review = { titulo: string; texto: string; botao: string }

/**
 * O que o último passo do cadastro de bar promete (WEB-238): concluir publica
 * o bar e já dá o plano do teste grátis.
 *
 * A promessa segue o que acontece de fato ao continuar. Sem e-mail confirmado
 * o cadastro só é enviado de `/verify-email`: o bar entra no ar depois da
 * confirmação, e de lá o dono vai sempre para `/plan`. Com o e-mail
 * confirmado, quem veio de um link (`callbackUrl`) volta para ele, sem passar
 * pelos planos.
 */
export function getPubOnboardingReview({
  emailVerified,
  goesToPlan
}: {
  emailVerified: boolean
  goesToPlan: boolean
}): Review {
  const oferta = `seu bar entra no ar e você ganha o plano ${PLAN_NAMES[ONBOARDING_TRIAL.plan]} grátis por ${ONBOARDING_TRIAL.days} dias, sem cartão.`
  if (!emailVerified) {
    return {
      titulo: 'Falta só confirmar seu e-mail',
      texto: `Revise os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, ${oferta} Em seguida você conhece os planos.`,
      botao: 'Confirmar meu e-mail'
    }
  }
  return {
    titulo: 'Pronto para colocar seu bar no ar',
    texto: `Revise os dados do bar. Ao continuar, salvamos o cadastro, ${oferta}${goesToPlan ? ' Em seguida você conhece os planos.' : ''}`,
    botao: 'Colocar meu bar no ar'
  }
}
