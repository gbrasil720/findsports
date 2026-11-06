import { describe, expect, test } from 'bun:test'
import { getPubOnboardingReview } from './pub-onboarding-review'

describe('revisão do cadastro de bar (WEB-238)', () => {
  test('e-mail confirmado: o bar entra no ar ao continuar, no plano escolhido', () => {
    expect(
      getPubOnboardingReview({ emailVerified: true, plan: 'pro' })
    ).toEqual({
      titulo: 'Tudo certo?',
      texto:
        'Confira antes de colocar no ar. Ao continuar, salvamos o cadastro, seu bar entra no ar e o teste grátis do Pro começa: 120 dias, sem cartão.',
      botao: 'Colocar meu bar no ar'
    })
  })

  test('e-mail ainda não confirmado: a ordem real é confirmar, e aí o bar entra no ar', () => {
    const review = getPubOnboardingReview({
      emailVerified: false,
      plan: 'elite'
    })
    expect(review).toEqual({
      titulo: 'Falta só confirmar seu e-mail',
      texto:
        'Confira os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, seu bar entra no ar e o teste grátis do Elite começa: 120 dias, sem cartão.',
      botao: 'Confirmar meu e-mail'
    })
    expect(review.botao).not.toContain('no ar')
  })
})
