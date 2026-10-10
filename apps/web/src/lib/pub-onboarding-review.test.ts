import { describe, expect, test } from 'bun:test'
import { getPubOnboardingReview } from './pub-onboarding-review'

const trial = { enabled: true, plan: 'elite', days: 45 } as const

describe('revisão do cadastro de bar (WEB-238)', () => {
  test('teste ligado e e-mail confirmado: o bar entra no ar ao continuar, e depois vêm os planos', () => {
    expect(
      getPubOnboardingReview({ trial, emailVerified: true, goesToPlan: true })
    ).toEqual({
      titulo: 'Pronto para colocar seu bar no ar',
      texto:
        'Revise os dados do bar. Ao continuar, salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 45 dias, sem cartão. Em seguida você conhece os planos.',
      botao: 'Colocar meu bar no ar'
    })
  })

  test('e-mail ainda não confirmado: a ordem real é confirmar, e aí o bar entra no ar', () => {
    const review = getPubOnboardingReview({
      trial,
      emailVerified: false,
      goesToPlan: true
    })
    expect(review).toEqual({
      titulo: 'Falta só confirmar seu e-mail',
      texto:
        'Revise os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 45 dias, sem cartão. Em seguida você conhece os planos.',
      botao: 'Confirmar meu e-mail'
    })
    expect(review.botao).not.toContain('no ar')
  })

  // De `/verify-email` o dono vai sempre para `/plan`, com ou sem link de origem.
  test('e-mail não confirmado com link de origem ainda passa pelos planos', () => {
    expect(
      getPubOnboardingReview({ trial, emailVerified: false, goesToPlan: false })
        .texto
    ).toContain('Em seguida você conhece os planos.')
  })

  test('com link de origem (callbackUrl) não promete os planos', () => {
    const review = getPubOnboardingReview({
      trial,
      emailVerified: true,
      goesToPlan: false
    })
    expect(review.texto).toBe(
      'Revise os dados do bar. Ao continuar, salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 45 dias, sem cartão.'
    )
    expect(review.botao).toBe('Colocar meu bar no ar')
  })

  test('um dia fica no singular', () => {
    expect(
      getPubOnboardingReview({
        trial: { ...trial, days: 1 },
        emailVerified: true,
        goesToPlan: true
      }).texto
    ).toContain('grátis por 1 dia, sem cartão.')
  })

  test.each([
    undefined,
    { ...trial, enabled: false }
  ])('teste desligado ou sem leitura: o texto de sempre', (off) => {
    expect(
      getPubOnboardingReview({
        trial: off,
        emailVerified: false,
        goesToPlan: false
      })
    ).toEqual({
      titulo: 'Pronto para escolher o plano',
      texto:
        'Revise os dados do bar. Ao continuar, salvamos o cadastro e você escolhe o plano.',
      botao: 'Escolher meu plano'
    })
  })
})
