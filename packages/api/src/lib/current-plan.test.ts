import { describe, expect, test } from 'bun:test'
import { issuesCounterCode } from './current-plan'

const now = new Date('2026-09-13T12:00:00.000Z')
const tomorrow = new Date('2026-09-14T12:00:00.000Z')
const yesterday = new Date('2026-09-12T12:00:00.000Z')

// O código do balcão (e com ele oferta, quem vai e validação) é do Elite vigente.
describe('issuesCounterCode', () => {
  test('Elite ativo emite', () => {
    expect(
      issuesCounterCode(
        { plan: 'elite', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(true)
  })

  test('Elite em trial vigente emite', () => {
    expect(
      issuesCounterCode(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: tomorrow },
        now
      )
    ).toBe(true)
  })

  test.each(['starter', 'pro'] as const)('%s ativo não emite', (plan) => {
    expect(
      issuesCounterCode({ plan, status: 'active', currentPeriodEnd: null }, now)
    ).toBe(false)
  })

  test.each([
    'past_due',
    'inactive',
    'cancelled'
  ] as const)('Elite em %s não emite', (status) => {
    expect(
      issuesCounterCode(
        { plan: 'elite', status, currentPeriodEnd: tomorrow },
        now
      )
    ).toBe(false)
  })

  test('trial Elite vencido não emite', () => {
    expect(
      issuesCounterCode(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: yesterday },
        now
      )
    ).toBe(false)
  })

  test('bar sem assinatura não emite', () => {
    expect(issuesCounterCode(null, now)).toBe(false)
  })
})
