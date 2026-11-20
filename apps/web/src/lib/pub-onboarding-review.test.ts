import { describe, expect, test } from 'bun:test'
import { getPubOnboardingReview } from './pub-onboarding-review'

describe('revisão do cadastro de bar (WEB-238)', () => {
  test('e-mail confirmado: o bar entra no ar ao continuar', () => {
    expect(getPubOnboardingReview({ emailVerified: true })).toEqual({
      titulo: 'Tudo certo?',
      texto:
        'Confira antes de colocar no ar. Ao continuar, salvamos o cadastro, seu bar entra no ar e o teste grátis de 90 dias começa, sem cartão.',
      botao: 'Colocar meu bar no ar'
    })
  })

  test('e-mail ainda não confirmado: a ordem real é confirmar, e aí o bar entra no ar', () => {
    const review = getPubOnboardingReview({ emailVerified: false })
    expect(review).toEqual({
      titulo: 'Falta só confirmar seu e-mail',
      texto:
        'Confira os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, seu bar entra no ar e o teste grátis de 90 dias começa, sem cartão.',
      botao: 'Confirmar meu e-mail'
    })
    expect(review.botao).not.toContain('no ar')
  })

  test('sem teste: não promete os 90 dias e o botão leva ao plano', () => {
    expect(
      getPubOnboardingReview({ emailVerified: true, trial: false })
    ).toEqual({
      titulo: 'Tudo certo?',
      texto:
        'Confira antes de colocar no ar. Ao continuar, salvamos o cadastro e você escolhe o plano para o bar entrar no ar. O teste grátis já foi usado neste e-mail.',
      botao: 'Salvar e escolher o plano'
    })
  })
})
