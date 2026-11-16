import { describe, expect, test } from 'bun:test'
import {
  missingProfileItems,
  type ProfileFacts,
  pickProfileAlert,
  profileAlertDismissedUntil
} from './profile-alert'

const now = new Date('2026-11-16T15:00:00Z')
const future = new Date('2026-12-16T00:00:00Z')
const sub = (plan: 'starter' | 'pro' | 'elite') => ({
  plan,
  status: 'active' as const,
  currentPeriodEnd: future
})

const empty: ProfileFacts = {
  openingHours: null,
  phone: '(11) 98765-4321',
  phoneAcceptsWhatsapp: false,
  houseOffer: null,
  menuUrl: null,
  description: null,
  descriptionPending: null,
  houseTeamCount: 0
}

describe('missingProfileItems', () => {
  test('a fila segue a ordem e o plano', () => {
    expect(missingProfileItems(empty, sub('elite'), now)).toEqual([
      'horario',
      'whatsapp',
      'oferta',
      'cardapio',
      'descricao',
      'times'
    ])
    expect(missingProfileItems(empty, sub('pro'), now)).toEqual([
      'horario',
      'whatsapp',
      'cardapio',
      'descricao',
      'times'
    ])
    expect(missingProfileItems(empty, sub('starter'), now)).toEqual([
      'horario',
      'whatsapp',
      'descricao',
      'times'
    ])
    // Teste vencido: sem plano vigente, nada pago entra.
    expect(
      missingProfileItems(
        empty,
        { plan: 'elite', status: 'trialing', currentPeriodEnd: now },
        now
      )
    ).not.toContain('oferta')
  })

  test('sem telefone, ou com menos de 10 dígitos, o WhatsApp não entra', () => {
    expect(
      missingProfileItems({ ...empty, phone: null }, null, now)
    ).not.toContain('whatsapp')
    expect(
      missingProfileItems({ ...empty, phone: '9876-543' }, null, now)
    ).not.toContain('whatsapp')
  })

  test('descrição em revisão e oferta em branco', () => {
    const facts = {
      ...empty,
      descriptionPending: 'Em revisão',
      houseOffer: '  '
    }
    const missing = missingProfileItems(facts, sub('elite'), now)
    expect(missing).not.toContain('descricao')
    expect(missing).toContain('oferta')
  })

  test('perfil completo não tem fila', () => {
    expect(
      missingProfileItems(
        {
          openingHours: [],
          phone: '11987654321',
          phoneAcceptsWhatsapp: true,
          houseOffer: 'Chopp em dobro',
          menuUrl: 'https://x.test',
          description: 'Bar',
          descriptionPending: null,
          houseTeamCount: 1
        },
        sub('elite'),
        now
      )
    ).toEqual([])
  })
})

describe('pickProfileAlert', () => {
  const today = '2026-11-16'

  test('o primeiro da fila', () => {
    expect(pickProfileAlert(['whatsapp', 'times'], [], today, now)).toBe(
      'whatsapp'
    )
    expect(pickProfileAlert([], [], today, now)).toBeNull()
  })

  test('o mesmo assunto continua no dia em que aparece', () => {
    const states = [
      { alert: 'whatsapp' as const, dismissedUntil: null, shownOn: today }
    ]
    expect(pickProfileAlert(['whatsapp', 'times'], states, today, now)).toBe(
      'whatsapp'
    )
  })

  test('resolvido hoje: o próximo só amanhã', () => {
    const states = [
      { alert: 'horario' as const, dismissedUntil: null, shownOn: today }
    ]
    expect(pickProfileAlert(['times'], states, today, now)).toBeNull()
    expect(pickProfileAlert(['times'], states, '2026-11-17', now)).toBe('times')
  })

  test('"Agora não" some por 3 dias e o próximo espera amanhã', () => {
    const until = profileAlertDismissedUntil(now)
    expect(until.toISOString()).toBe('2026-11-19T15:00:00.000Z')
    const states = [
      { alert: 'horario' as const, dismissedUntil: until, shownOn: today }
    ]
    const missing = ['horario', 'times'] as const
    expect(pickProfileAlert([...missing], states, today, now)).toBeNull()
    const tomorrow = new Date('2026-11-17T15:00:00Z')
    expect(pickProfileAlert([...missing], states, '2026-11-17', tomorrow)).toBe(
      'times'
    )
    const later = new Date('2026-11-19T15:00:01Z')
    expect(pickProfileAlert([...missing], states, '2026-11-19', later)).toBe(
      'horario'
    )
  })
})
