/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import { attemptPhase, retryable, settleAuth } from './auth-attempt'

test('sem rede, a chamada que lança vira { error } passageira', async () => {
  const result = await settleAuth(
    Promise.reject(new TypeError('Network request failed'))
  )
  expect(result.data).toBeNull()
  expect(result.error).toMatchObject({
    status: 0,
    message: 'Network request failed'
  })
  expect(retryable(result.error)).toBe(true)
})

test('a resposta do servidor passa como veio', async () => {
  const refused = {
    data: null,
    error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401, statusText: '' }
  }
  expect(await settleAuth(Promise.resolve(refused))).toBe(refused)
  expect(retryable(refused.error)).toBe(false)
})

test('5xx vale "Tentar de novo"; 429 pede para esperar', () => {
  expect(retryable({ status: 503, statusText: '' })).toBe(true)
  expect(retryable({ status: 429, statusText: '' })).toBe(false)
})

test('a fase do botão: enviando, falhou, tentando de novo', () => {
  expect(attemptPhase(false, false)).toBe('idle')
  expect(attemptPhase(true, false)).toBe('sending')
  expect(attemptPhase(false, true)).toBe('failed')
  expect(attemptPhase(true, true)).toBe('retrying')
})
