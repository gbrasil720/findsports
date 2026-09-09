import { describe, expect, it, test } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  assertEventIntervalValid,
  getCurrentPlan,
  resolveEventEndsAt,
  resolvePhoneAcceptsWhatsapp
} from './pub'

describe('getCurrentPlan', () => {
  const now = new Date('2026-09-08T12:00:00.000Z')

  test.each([
    ['starter', 'starter'],
    ['pro', 'pro'],
    ['elite', 'elite']
  ] as const)('considera o plano ativo %s como vigente', (plan, expected) => {
    expect(
      getCurrentPlan({ plan, status: 'active', currentPeriodEnd: null }, now)
    ).toBe(expected)
  })

  test('não considera trial sem fim como plano vigente', () => {
    expect(
      getCurrentPlan(
        { plan: 'pro', status: 'trialing', currentPeriodEnd: null },
        now
      )
    ).toBeNull()
  })

  test('considera trial com fim futuro como plano vigente', () => {
    expect(
      getCurrentPlan(
        {
          plan: 'pro',
          status: 'trialing',
          currentPeriodEnd: new Date('2026-09-09T12:00:00.000Z')
        },
        now
      )
    ).toBe('pro')
  })

  test('não considera trial expirado como plano vigente', () => {
    expect(
      getCurrentPlan(
        {
          plan: 'pro',
          status: 'trialing',
          currentPeriodEnd: new Date('2026-09-08T11:59:59.999Z')
        },
        now
      )
    ).toBeNull()
  })

  test.each([
    'past_due',
    'inactive',
    'cancelled'
  ] as const)('não considera o status %s como plano vigente', (status) => {
    expect(
      getCurrentPlan({ plan: 'pro', status, currentPeriodEnd: null }, now)
    ).toBeNull()
  })

  test('retorna sem plano quando não há assinatura', () => {
    expect(getCurrentPlan(null, now)).toBeNull()
  })
})

describe('resolvePhoneAcceptsWhatsapp', () => {
  // -----------------------------------------------------------------------
  // No input — only revoke on phone change
  // -----------------------------------------------------------------------

  it('returns null when no input and no phone change', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      undefined,
      undefined,
      '11999999999'
    )
    expect(result).toBeNull()
  })

  it('revokes to false when phone changes and no explicit accepts input', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      undefined,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('returns null when phone unchanged and no explicit accepts input', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '11999999999',
      undefined,
      '11999999999'
    )
    expect(result).toBeNull()
  })

  it('returns null when bar has no phone and no input', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, undefined, null)
    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Confirm true — requires phone
  // -----------------------------------------------------------------------

  it('confirms true when bar has existing phone', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, true, '11999999999')
    expect(result).toEqual({ value: true, changed: true })
  })

  it('confirms true when phone sent in same call', () => {
    const result = resolvePhoneAcceptsWhatsapp('11999999999', true, null)
    expect(result).toEqual({ value: true, changed: true })
  })

  it('confirms true when phone sent and bar had different phone (phone change revokes)', () => {
    // Phone changed → revoke atomically even if input tries true
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      true,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('throws when confirming true without any phone', () => {
    expect(() => resolvePhoneAcceptsWhatsapp(undefined, true, null)).toThrow(
      TRPCError
    )
  })

  it('throws when confirming true with empty phone string', () => {
    expect(() => resolvePhoneAcceptsWhatsapp(undefined, true, '   ')).toThrow(
      TRPCError
    )
  })

  it('throws when confirming true with empty phone in input', () => {
    expect(() => resolvePhoneAcceptsWhatsapp('', true, null)).toThrow(TRPCError)
  })

  // -----------------------------------------------------------------------
  // Confirm false — always allowed
  // -----------------------------------------------------------------------

  it('confirms false when bar has phone', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, false, '11999999999')
    expect(result).toEqual({ value: false, changed: true })
  })

  it('confirms false when bar has no phone', () => {
    const result = resolvePhoneAcceptsWhatsapp(undefined, false, null)
    expect(result).toEqual({ value: false, changed: true })
  })

  // -----------------------------------------------------------------------
  // Phone change — atomic revocation
  // -----------------------------------------------------------------------

  it('revokes to false when phone changes regardless of input true', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      true,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('revokes to false when phone changes and input is false', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '22988888888',
      false,
      '11999999999'
    )
    expect(result).toEqual({ value: false, changed: true })
  })

  it('allows confirming true on subsequent call with registered phone', () => {
    // First call: set phone + confirm true → allowed (initial setup, not a change)
    const first = resolvePhoneAcceptsWhatsapp('11999999999', true, null)
    expect(first).toEqual({ value: true, changed: true })

    // Second call: reuse registered phone + confirm true → still succeeds
    const second = resolvePhoneAcceptsWhatsapp(undefined, true, '11999999999')
    expect(second).toEqual({ value: true, changed: true })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles whitespace-only existing phone as no phone', () => {
    expect(() => resolvePhoneAcceptsWhatsapp(undefined, true, '   ')).toThrow(
      TRPCError
    )
  })

  it('treats same phone string as no change', () => {
    const result = resolvePhoneAcceptsWhatsapp(
      '11999999999',
      true,
      '11999999999'
    )
    expect(result).toEqual({ value: true, changed: true })
  })
})

describe('assertEventIntervalValid', () => {
  const startsAt = new Date('2026-09-05T18:00:00Z')

  it('accepts an endsAt strictly after startsAt', () => {
    expect(() =>
      assertEventIntervalValid(startsAt, new Date('2026-09-05T19:00:00Z'))
    ).not.toThrow()
  })

  it('rejects an endsAt equal to startsAt', () => {
    expect(() => assertEventIntervalValid(startsAt, startsAt)).toThrow(
      TRPCError
    )
  })

  it('rejects an endsAt before startsAt', () => {
    expect(() =>
      assertEventIntervalValid(startsAt, new Date('2026-09-05T17:00:00Z'))
    ).toThrow(TRPCError)
  })

  it('accepts no endsAt (null)', () => {
    expect(() => assertEventIntervalValid(startsAt, null)).not.toThrow()
  })

  it('accepts no endsAt (undefined)', () => {
    expect(() => assertEventIntervalValid(startsAt, undefined)).not.toThrow()
  })
})

describe('resolveEventEndsAt', () => {
  it('returns undefined for an omitted field, leaving the stored value untouched', () => {
    expect(resolveEventEndsAt(undefined)).toBeUndefined()
  })

  it('returns null for an explicit clear, persisting NULL', () => {
    expect(resolveEventEndsAt(null)).toBeNull()
  })

  it('normalizes a datetime string to a Date', () => {
    const iso = '2026-09-05T18:00:00.000Z'
    expect(resolveEventEndsAt(iso)).toEqual(new Date(iso))
  })
})
