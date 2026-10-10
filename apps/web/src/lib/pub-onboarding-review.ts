import type { SubscriptionPlan } from '@findsports_oficial/db'
import { getPlan } from './plan-catalog'

type Review = { titulo: string; texto: string; botao: string }

/**
 * O que o último passo do cadastro de bar promete (WEB-238). Com o teste do
 * cadastro ligado, concluir publica o bar e já dá o plano; chave desligada,
 * ausente, carregando ou com erro de leitura cai no texto de sempre, que é o
 * padrão do registro.
 *
 * A promessa segue o que acontece de fato ao continuar. Sem e-mail confirmado
 * o cadastro só é enviado de `/verify-email`: o bar entra no ar depois da
 * confirmação, e de lá o dono vai sempre para `/plan`. Com o e-mail
 * confirmado, quem veio de um link (`callbackUrl`) volta para ele, sem passar
 * pelos planos.
 */
export function getPubOnboardingReview({
  trial,
  emailVerified,
  goesToPlan
}: {
  trial: { enabled: boolean; plan: SubscriptionPlan; days: number } | undefined
  emailVerified: boolean
  goesToPlan: boolean
}): Review {
  if (!trial?.enabled) {
    return {
      titulo: 'Pronto para escolher o plano',
      texto:
        'Revise os dados do bar. Ao continuar, salvamos o cadastro e você escolhe o plano.',
      botao: 'Escolher meu plano'
    }
  }
  const oferta = `seu bar entra no ar e você ganha o plano ${getPlan(trial.plan).name} grátis por ${trial.days} ${trial.days === 1 ? 'dia' : 'dias'}, sem cartão.`
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
