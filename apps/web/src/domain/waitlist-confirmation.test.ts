import { expect, test } from 'bun:test'

import {
  isRetryableWaitlistFailure,
  WAITLIST_TOKEN_MIN_LENGTH,
  waitlistConfirmationState
} from './waitlist-confirmation'

const TOKEN = 'a'.repeat(WAITLIST_TOKEN_MIN_LENGTH)

test('queda de rede não vira "link expirado"', () => {
  expect(
    waitlistConfirmationState({ token: TOKEN, isError: true, data: undefined })
  ).toEqual({ kind: 'failed', failure: 'unavailable' })
  expect(isRetryableWaitlistFailure('unavailable')).toBe(true)
})

test('link sem token é estado próprio, não espera infinita', () => {
  for (const token of ['', 'abc', 'a'.repeat(WAITLIST_TOKEN_MIN_LENGTH - 1)]) {
    expect(
      waitlistConfirmationState({ token, isError: false, data: undefined })
    ).toEqual({ kind: 'failed', failure: 'incomplete_link' })
  }
})

test('confirmação repetida continua confirmada', () => {
  expect(
    waitlistConfirmationState({
      token: TOKEN,
      isError: false,
      data: { confirmed: true, waitlistId: 'w1', emailSent: true }
    })
  ).toEqual({ kind: 'confirmed', emailSent: true })
})

test('cada recusa da procedure chega inteira à tela', () => {
  for (const reason of ['expired', 'cancelled', 'invalid'] as const) {
    expect(
      waitlistConfirmationState({
        token: TOKEN,
        isError: false,
        data: { confirmed: false, reason }
      })
    ).toEqual({ kind: 'failed', failure: reason })
    // Nenhuma delas se resolve tentando o mesmo link de novo.
    expect(isRetryableWaitlistFailure(reason)).toBe(false)
  }
})

test('com token e sem resposta, a tela está mesmo carregando', () => {
  expect(
    waitlistConfirmationState({ token: TOKEN, isError: false, data: undefined })
  ).toEqual({ kind: 'confirming' })
})
