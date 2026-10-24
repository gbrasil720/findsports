import { describe, expect, test } from 'bun:test'
import {
  getPubOnboardingReview,
  resumoDoHorario
} from './pub-onboarding-review'

describe('revisão do cadastro de bar (WEB-238)', () => {
  test('e-mail confirmado: o bar entra no ar ao continuar, e depois vêm os planos', () => {
    expect(
      getPubOnboardingReview({ emailVerified: true, goesToPlan: true })
    ).toEqual({
      titulo: 'Pronto para colocar',
      tint: 'seu bar no ar',
      texto:
        'Revise os dados do bar. Ao continuar, salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 120 dias, sem cartão. Em seguida você conhece os planos.',
      botao: 'Colocar meu bar no ar'
    })
  })

  test('e-mail ainda não confirmado: a ordem real é confirmar, e aí o bar entra no ar', () => {
    const review = getPubOnboardingReview({
      emailVerified: false,
      goesToPlan: true
    })
    expect(review).toEqual({
      titulo: 'Falta só',
      tint: 'confirmar seu e-mail',
      texto:
        'Revise os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 120 dias, sem cartão. Em seguida você conhece os planos.',
      botao: 'Confirmar meu e-mail'
    })
    expect(review.botao).not.toContain('no ar')
  })

  // De `/verify-email` o dono vai sempre para `/plan`, com ou sem link de origem.
  test('e-mail não confirmado com link de origem ainda passa pelos planos', () => {
    expect(
      getPubOnboardingReview({ emailVerified: false, goesToPlan: false }).texto
    ).toContain('Em seguida você conhece os planos.')
  })

  test('com link de origem (callbackUrl) não promete os planos', () => {
    const review = getPubOnboardingReview({
      emailVerified: true,
      goesToPlan: false
    })
    expect(review.texto).toBe(
      'Revise os dados do bar. Ao continuar, salvamos o cadastro, seu bar entra no ar e você ganha o plano Elite grátis por 120 dias, sem cartão.'
    )
    expect(review.botao).toBe('Colocar meu bar no ar')
  })
})

describe('linha do horário na revisão (WEB-448)', () => {
  test('agrupa os dias como o design: "Seg a qui 17–00 · Sex e sáb 17–02 · Dom 12–22"', () => {
    const semana = { opens: '17:00', closes: '00:00' }
    const fds = { opens: '17:00', closes: '02:00' }
    expect(
      resumoDoHorario([
        { opens: '12:00', closes: '22:00' },
        semana,
        semana,
        semana,
        semana,
        fds,
        fds
      ])
    ).toBe('Seg a qui 17–00 · Sex e sáb 17–02 · Dom 12–22')
  })

  test('minuto que não é redondo fica; dia fechado sai; sem horário é nulo', () => {
    expect(
      resumoDoHorario([
        null,
        null,
        { opens: '18:30', closes: '23:00' },
        null,
        null,
        null,
        null
      ])
    ).toBe('Ter 18:30–23')
    expect(resumoDoHorario(null)).toBeNull()
    expect(resumoDoHorario(Array(7).fill(null))).toBeNull()
  })
})
