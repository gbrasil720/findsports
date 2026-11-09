import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'

type Review = { titulo: string; texto: string; botao: string }

/**
 * O que o último passo do cadastro de bar promete (WEB-238): concluir publica
 * o bar e começa o teste grátis. O plano do teste não é deste cadastro: o
 * dono escolhe logo depois do primeiro jogo, antes de entrar no painel.
 *
 * A promessa segue o que acontece de fato ao continuar. Sem e-mail confirmado
 * o cadastro só é enviado de `/verify-email`: o bar entra no ar depois da
 * confirmação. Com ele, o bar entra no ar ali, e o comprovante vem em seguida.
 */
export function getPubOnboardingReview({
  emailVerified
}: {
  emailVerified: boolean
}): Review {
  const oferta = `seu bar entra no ar e o teste grátis de ${ONBOARDING_TRIAL.days} dias começa, sem cartão.`
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
