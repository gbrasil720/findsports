import { describe, expect, test } from 'bun:test'

import {
  normalizeCustomerPayment,
  normalizeCustomerPayments,
  normalizePortalUrl
} from './dodo-customer-client'

describe('Dodo customer adapter', () => {
  test('exposes only the fields consumed by billing UI', () => {
    expect(
      normalizeCustomerPayment({
        payment_id: 'payment-1',
        status: 'succeeded',
        total_amount: 18_900,
        created_at: '2026-08-13T12:00:00.000Z'
      })
    ).toEqual({
      paymentId: 'payment-1',
      status: 'succeeded',
      totalAmount: 18_900,
      createdAt: '2026-08-13T12:00:00.000Z'
    })
  })

  test('preserves the previous string rendering for missing statuses', () => {
    expect(
      normalizeCustomerPayment({
        payment_id: 'payment-2',
        status: null,
        total_amount: 0,
        created_at: '2026-08-13T12:00:00.000Z'
      }).status
    ).toBe('null')
  })

  test('treats an absent list as empty and rejects malformed payloads', () => {
    expect(normalizeCustomerPayments(undefined)).toEqual([])
    expect(() => normalizeCustomerPayments({ items: [{}] })).toThrow(
      'Resposta de pagamento inválida'
    )
    expect(() => normalizeCustomerPayments({ items: 'invalid' })).toThrow(
      'Lista de pagamentos inválida'
    )
  })

  test('returns null when the portal response has no usable URL', () => {
    expect(normalizePortalUrl(undefined)).toBeNull()
    expect(normalizePortalUrl({ redirect: true })).toBeNull()
    expect(normalizePortalUrl({ url: 123 })).toBeNull()
    expect(normalizePortalUrl({ url: 'https://portal.example' })).toBe(
      'https://portal.example'
    )
  })
})
