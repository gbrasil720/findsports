import { describe, expect, it } from 'bun:test'
import { mensagemOnboardingJaConcluido } from './onboarding-concluido'

// Formato que o cliente tRPC entrega para um `TRPCError` do servidor.
const recusa = (code: string) =>
  Object.assign(new Error('Onboarding já concluído.'), { data: { code } })

describe('onboarding já concluído', () => {
  it('diz o que houve em vez da falha genérica', () => {
    expect(mensagemOnboardingJaConcluido(recusa('CONFLICT'))).toBe(
      'Seu cadastro já estava concluído.'
    )
  })

  it('outras recusas seguem para a mensagem de falha', () => {
    expect(
      mensagemOnboardingJaConcluido(recusa('INTERNAL_SERVER_ERROR'))
    ).toBeNull()
  })
})
