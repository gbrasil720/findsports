import { describe, expect, it } from 'bun:test'
import { customerPrefillFor, trialEndForCheckout } from './stripe-checkout'

const now = new Date('2026-10-09T12:00:00Z')
const HOUR = 60 * 60 * 1000
const inHours = (h: number) => new Date(now.getTime() + h * HOUR)
const seconds = (date: Date) => Math.floor(date.getTime() / 1000)

const trial = (currentPeriodEnd: Date | null) => ({
  status: 'trialing',
  currentPeriodEnd,
  externalSubscriptionId: null
})

describe('fim do teste grátis herdado pelo checkout (WEB-31)', () => {
  it('em teste: a primeira cobrança é no fim do teste do cadastro', () => {
    const end = inHours(24 * 100)
    expect(trialEndForCheckout(trial(end), now)).toBe(seconds(end))
  })

  it('faltando menos de dois dias: o mínimo que o Stripe aceita', () => {
    expect(trialEndForCheckout(trial(inHours(5)), now)).toBe(
      seconds(inHours(49))
    )
  })

  it('teste vencido ou sem data: cobra na hora', () => {
    expect(trialEndForCheckout(trial(inHours(-1)), now)).toBeUndefined()
    expect(trialEndForCheckout(trial(null), now)).toBeUndefined()
  })

  it('sem assinatura, ou assinatura que não é teste: cobra na hora', () => {
    expect(trialEndForCheckout(null, now)).toBeUndefined()
    expect(
      trialEndForCheckout({ ...trial(inHours(240)), status: 'inactive' }, now)
    ).toBeUndefined()
  })

  it('teste que já é do Stripe não é herdado de novo', () => {
    expect(
      trialEndForCheckout(
        { ...trial(inHours(240)), externalSubscriptionId: 'sub_1' },
        now
      )
    ).toBeUndefined()
  })
})

describe('cliente do Stripe com os dados do cadastro (WEB-328)', () => {
  const ownerBar = {
    name: 'Bar do Zé',
    address: 'Rua Augusta, 100',
    neighborhood: 'Consolação',
    city: 'São Paulo',
    uf: 'SP'
  }

  it('cliente sem endereço: nome, empresa e endereço do bar', () => {
    expect(customerPrefillFor({ address: null }, 'Zé Dono', ownerBar)).toEqual({
      name: 'Zé Dono',
      individual_name: 'Zé Dono',
      business_name: 'Bar do Zé',
      address: {
        line1: 'Rua Augusta, 100',
        line2: 'Consolação',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR'
      }
    })
  })

  it('bar anterior à UF: endereço sem estado', () => {
    const { address } = customerPrefillFor({ address: null }, 'Zé Dono', {
      ...ownerBar,
      uf: null
    })
    expect(address).toEqual({
      line1: 'Rua Augusta, 100',
      line2: 'Consolação',
      city: 'São Paulo',
      country: 'BR'
    })
  })

  it('cliente que já tem endereço: só nome e empresa são regravados', () => {
    expect(
      customerPrefillFor({ address: { line1: 'Outro' } }, 'Zé Dono', ownerBar)
    ).toEqual({
      name: 'Zé Dono',
      individual_name: 'Zé Dono',
      business_name: 'Bar do Zé'
    })
  })

  it('nomes além do limite do Stripe são cortados em 150 caracteres', () => {
    const prefill = customerPrefillFor({ address: null }, 'a'.repeat(200), {
      ...ownerBar,
      name: 'b'.repeat(200)
    })
    expect(prefill.individual_name).toHaveLength(150)
    expect(prefill.business_name).toHaveLength(150)
  })
})
