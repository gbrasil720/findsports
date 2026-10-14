import { describe, expect, it } from 'bun:test'

import { refusalMessage } from './errors'

function trpcError(message: string, code: string) {
  return Object.assign(new Error(message), { data: { code } })
}

describe('refusalMessage', () => {
  it('mostra a recusa de regra como o servidor escreveu', () => {
    expect(
      refusalMessage(
        trpcError('Este jogo tem 1 reserva ativa.', 'PRECONDITION_FAILED'),
        'x'
      )
    ).toBe('Este jogo tem 1 reserva ativa.')
    expect(
      refusalMessage(trpcError('Já está verificado.', 'BAD_REQUEST'), 'x')
    ).toBe('Já está verificado.')
  })

  it('não mostra o JSON da validação de entrada', () => {
    expect(
      refusalMessage(
        trpcError('[{"code":"too_small"}]', 'BAD_REQUEST'),
        'Falhou.'
      )
    ).not.toContain('too_small')
  })
})
