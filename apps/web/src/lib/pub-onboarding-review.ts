import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'

type Review = { titulo: string; texto: string; botao: string }

/**
 * O que o último passo do cadastro de bar promete (WEB-238): concluir publica
 * o bar e começa o teste grátis no plano escolhido no passo "Plano" (o teste
 * do cadastro vale para qualquer plano, WEB-358).
 *
 * A promessa segue o que acontece de fato ao continuar. Sem e-mail confirmado
 * o cadastro só é enviado de `/verify-email`: o bar entra no ar depois da
 * confirmação. Com ele, o bar entra no ar ali, e o comprovante vem em seguida.
 */
export function getPubOnboardingReview({
  emailVerified,
  plan
}: {
  emailVerified: boolean
  plan: SubscriptionPlan
}): Review {
  const oferta = `seu bar entra no ar e o teste grátis do ${PLAN_NAMES[plan]} começa: ${ONBOARDING_TRIAL.days} dias, sem cartão.`
  if (!emailVerified) {
    return {
      titulo: 'Falta só confirmar seu e-mail',
      texto: `Confira os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, ${oferta}`,
      botao: 'Confirmar meu e-mail'
    }
  }
  return {
    titulo: 'Tudo certo?',
    texto: `Confira antes de colocar no ar. Ao continuar, salvamos o cadastro, ${oferta}`,
    botao: 'Colocar meu bar no ar'
  }
}
