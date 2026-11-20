import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'

/** O e-mail já ganhou o teste do cadastro, nesta conta ou numa excluída. */
export const TRIAL_USED = 'O teste grátis já foi usado neste e-mail.'

type Review = { titulo: string; texto: string; botao: string }

/**
 * O que o último passo do cadastro de bar promete (WEB-238): concluir publica
 * o bar e começa o teste grátis. O plano do teste não é deste cadastro: o
 * dono escolhe logo depois do primeiro jogo, antes de entrar no painel.
 *
 * A promessa segue o que acontece de fato ao continuar. Sem e-mail confirmado
 * o cadastro só é enviado de `/verify-email`: o bar entra no ar depois da
 * confirmação. Com ele, o bar entra no ar ali, e o comprovante vem em seguida.
 *
 * Sem teste (o e-mail já usou o seu, `onboarding.trialAvailable`), o bar só
 * entra no ar ao contratar.
 */
export function getPubOnboardingReview({
  emailVerified,
  trial = true
}: {
  emailVerified: boolean
  trial?: boolean
}): Review {
  const oferta = trial
    ? `, seu bar entra no ar e o teste grátis de ${ONBOARDING_TRIAL.days} dias começa, sem cartão.`
    : ` e você escolhe o plano para o bar entrar no ar. ${TRIAL_USED}`
  if (!emailVerified) {
    return {
      titulo: 'Falta só confirmar seu e-mail',
      texto: `Confira os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro${oferta}`,
      botao: 'Confirmar meu e-mail'
    }
  }
  return {
    titulo: 'Tudo certo?',
    texto: `Confira antes de colocar no ar. Ao continuar, salvamos o cadastro${oferta}`,
    botao: trial ? 'Colocar meu bar no ar' : 'Salvar e escolher o plano'
  }
}
