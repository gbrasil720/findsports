import { describe, expect, it, test } from 'bun:test'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import { TRPCError } from '@trpc/server'
import { getCurrentPlan, getSubscriptionStanding } from '../lib/current-plan'
import {
  addressFieldsChanged,
  assertEventIntervalValid,
  eventLimitMessage,
  pubRouter,
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

describe('getSubscriptionStanding', () => {
  const now = new Date('2026-09-08T12:00:00.000Z')
  const past = new Date('2026-09-07T12:00:00.000Z')
  const future = new Date('2026-09-09T12:00:00.000Z')

  test.each([
    ['active', null, 'current'],
    ['trialing', future, 'current'],
    ['past_due', future, 'past_due'],
    ['trialing', past, 'trial_ended'],
    ['trialing', null, 'trial_ended'],
    ['inactive', null, 'ended'],
    ['cancelled', null, 'ended']
  ] as const)('%s até %s é %s', (status, currentPeriodEnd, expected) => {
    expect(
      getSubscriptionStanding({ plan: 'pro', status, currentPeriodEnd }, now)
    ).toBe(expected)
  })

  test('sem assinatura não tem situação', () => {
    expect(getSubscriptionStanding(null, now)).toBeNull()
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

describe('addressFieldsChanged', () => {
  const existing = { address: 'Rua A, 1', neighborhood: 'Centro', city: 'SP' }

  test('endereço reenviado igual não geocodifica', () => {
    expect(addressFieldsChanged({ ...existing }, existing)).toBe(false)
    expect(addressFieldsChanged({}, existing)).toBe(false)
  })

  test('qualquer campo diferente geocodifica', () => {
    expect(
      addressFieldsChanged({ ...existing, neighborhood: 'Sé' }, existing)
    ).toBe(true)
    expect(addressFieldsChanged({ city: 'RJ' }, existing)).toBe(true)
  })

  // WEB-270: a UF muda onde o endereço fica, então também geocodifica —
  // inclusive a primeira, no bar cadastrado antes do campo.
  test('UF nova ou trocada geocodifica; a mesma, não', () => {
    expect(addressFieldsChanged({ uf: 'SP' }, existing)).toBe(true)
    expect(addressFieldsChanged({ uf: 'SP' }, { ...existing, uf: null })).toBe(
      true
    )
    expect(addressFieldsChanged({ uf: 'RJ' }, { ...existing, uf: 'SP' })).toBe(
      true
    )
    expect(
      addressFieldsChanged({ ...existing, uf: 'SP' }, { ...existing, uf: 'SP' })
    ).toBe(false)
  })
})

// WEB-265: o formulário do painel conta com os mesmos limites; aqui se prova
// que o servidor recusa o que passa deles, sem banco (o schema corta antes).
describe('limites de texto do jogo', () => {
  const valid = {
    eventId: crypto.randomUUID(),
    sportId: crypto.randomUUID(),
    championship: 'c'.repeat(EVENT_CHAMPIONSHIP_MAX_LENGTH),
    startsAt: '2026-10-10T21:00:00.000Z',
    participantFreeText: 't'.repeat(EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH)
  }

  test.each([
    'createEvent',
    'updateEvent'
  ] as const)('%s aceita no limite e recusa um caractere a mais', (name) => {
    const [schema] = (
      pubRouter[name] as unknown as {
        _def: {
          inputs: Array<{ safeParse: (v: unknown) => { success: boolean } }>
        }
      }
    )._def.inputs
    const accepts = (input: object) => schema?.safeParse(input).success

    expect(accepts(valid)).toBe(true)
    expect(accepts({ ...valid, championship: `${valid.championship}c` })).toBe(
      false
    )
    expect(accepts({ ...valid, championship: 'c' })).toBe(false)
    // Espaço não conta para o mínimo: o campo é aparado antes de validar.
    expect(accepts({ ...valid, championship: '  ' })).toBe(false)
    expect(accepts({ ...valid, championship: ' c ' })).toBe(false)
    expect(accepts({ ...valid, championship: ' cc ' })).toBe(true)
    expect(
      accepts({
        ...valid,
        participantFreeText: `${valid.participantFreeText}t`
      })
    ).toBe(false)
  })
})

// WEB-331: Pro ou Elite parado cai no limite do Starter (WEB-129); a recusa
// não o chama de Starter nem manda fazer upgrade.
describe('eventLimitMessage', () => {
  const now = new Date('2026-10-09T12:00:00.000Z')
  const past = new Date('2026-10-01T12:00:00.000Z')
  const STARTER =
    'Plano Starter permite até 5 jogos por ciclo de cobrança. Faça upgrade para o plano Pro para jogos ilimitados.'

  test.each([
    ['elite', 'past_due', 'Elite'],
    ['pro', 'trialing', 'Pro']
  ] as const)('%s parado (%s) manda regularizar', (plan, status, name) => {
    expect(
      eventLimitMessage({ plan, status, currentPeriodEnd: past }, now)
    ).toBe(
      `Seu plano ${name} está parado e permite até 5 jogos por ciclo de cobrança. Regularize a assinatura para voltar aos jogos ilimitados.`
    )
  })

  test('Starter, mesmo parado, e bar sem assinatura seguem com o texto do Starter', () => {
    expect(
      eventLimitMessage(
        { plan: 'starter', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(STARTER)
    expect(
      eventLimitMessage(
        { plan: 'starter', status: 'past_due', currentPeriodEnd: past },
        now
      )
    ).toBe(STARTER)
    expect(eventLimitMessage(null, now)).toBe(STARTER)
  })
})
