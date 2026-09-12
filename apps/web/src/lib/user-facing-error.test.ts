import { expect, test } from 'bun:test'

import { getUserFacingError, isRetryableError } from './user-facing-error'

test('converte erros técnicos sem expor a mensagem original', () => {
  const error = Object.assign(new Error('database connection refused'), {
    data: { code: 'INTERNAL_SERVER_ERROR' }
  })

  expect(
    getUserFacingError(error, 'Não foi possível carregar o conteúdo.')
  ).toEqual({
    message: 'Não foi possível carregar o conteúdo.',
    retryable: true
  })
  expect(
    getUserFacingError(error, 'Não foi possível carregar o conteúdo.').message
  ).not.toContain('database')
})

test('só oferece retry para falhas temporárias', () => {
  expect(isRetryableError('Failed to fetch')).toBe(true)
  expect(isRetryableError({ code: 'NETWORK_ERROR' })).toBe(true)
  expect(
    isRetryableError({ code: 'UNKNOWN', message: 'network offline' })
  ).toBe(true)
  expect(isRetryableError({ status: 503 })).toBe(true)
  expect(isRetryableError({ status: 0 })).toBe(true)
  expect(isRetryableError({ status: 401 })).toBe(false)
  expect(isRetryableError({ status: 422 })).toBe(false)
  expect(isRetryableError(new Error('credenciais inválidas'))).toBe(false)
  expect(
    getUserFacingError(
      { status: 401 },
      'Não foi possível entrar.',
      'credentials'
    ).message
  ).toBe('Credenciais inválidas. Verifique e tente novamente.')
  expect(
    getUserFacingError(
      { status: 503 },
      'Credenciais inválidas. Verifique e tente novamente.',
      'credentials'
    )
  ).toEqual({
    message: 'Credenciais inválidas. Verifique e tente novamente.',
    retryable: true
  })
  expect(
    getUserFacingError(
      { status: 400, message: 'Este link não é válido ou já expirou.' },
      'Não foi possível ativar a conta.'
    ).message
  ).toBe('Este link não é válido ou já expirou.')
})
