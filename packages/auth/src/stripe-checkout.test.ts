import { describe, expect, it, spyOn } from 'bun:test'
import type Stripe from 'stripe'
import {
  customerPrefillFor,
  founderCouponUsable,
  prefillCustomer,
  pushInvoiceDetails,
  trialEndForCheckout,
  usableFounderCoupon
} from './stripe-checkout'

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

describe('consulta do cupom de fundador com teto de tempo', () => {
  /** Stripe dublado: guarda as opções de cada consulta de cupom. */
  function stripeWith(answer: () => Promise<{ valid: boolean }>) {
    const requests: unknown[] = []
    const client = {
      coupons: {
        retrieve: (_id: string, _params: unknown, request: unknown) => {
          requests.push(request)
          return answer()
        }
      }
    } as unknown as Stripe
    return { client, requests }
  }
  // O que o SDK devolve quando o teto estoura.
  const slow = () => Promise.reject(new Error('Request aborted due to timeout'))

  it('consulta com teto de 5s e sem nova tentativa', async () => {
    const { client, requests } = stripeWith(async () => ({ valid: true }))
    expect(await founderCouponUsable(client)).toBe(true)
    expect(requests).toEqual([{ timeout: 5000, maxNetworkRetries: 0 }])
  })

  /** O cupom que `usableFounderCoupon` devolveu e o que ele registrou no log. */
  async function checkoutWith(answer: () => Promise<{ valid: boolean }>) {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const coupon = await usableFounderCoupon(stripeWith(answer).client)
      const logs = error.mock.calls.map(([line]) => JSON.parse(String(line)))
      return { coupon, logs }
    } finally {
      error.mockRestore()
    }
  }

  // Lentidão do Stripe não pode tirar o desconto prometido ao bar fundador.
  it('Stripe lento: o checkout mantém o cupom e registra que não conferiu', async () => {
    expect(await checkoutWith(slow)).toEqual({
      coupon: 'eM7dQpMF',
      logs: [
        {
          level: 'error',
          event: 'stripe_founder_coupon_unverified',
          couponId: 'eM7dQpMF',
          message: 'Request aborted due to timeout'
        }
      ]
    })
    expect(await founderCouponUsable(stripeWith(slow).client)).toBe(true)
  })

  const unavailable = {
    coupon: null,
    logs: [
      {
        level: 'error',
        event: 'stripe_founder_coupon_unavailable',
        couponId: 'eM7dQpMF',
        reason: 'coupon_invalid'
      }
    ]
  }

  it('cupom esgotado: segue sem ele, e o log diz que foi o cupom', async () => {
    expect(await checkoutWith(async () => ({ valid: false }))).toEqual(
      unavailable
    )
  })

  it('cupom apagado ou com o id errado: o Stripe respondeu que não existe', async () => {
    const missing = () =>
      Promise.reject(
        Object.assign(new Error('No such coupon'), {
          type: 'StripeInvalidRequestError'
        })
      )
    expect(await checkoutWith(missing)).toEqual(unavailable)
    expect(await founderCouponUsable(stripeWith(missing).client)).toBe(false)
  })

  it('Stripe respondeu e o cupom vale: entra no checkout', async () => {
    const { client } = stripeWith(async () => ({ valid: true }))
    expect(await usableFounderCoupon(client)).toBe('eM7dQpMF')
  })
})

describe('dados do cadastro no cliente com teto de tempo', () => {
  it('leitura e gravação do cliente não seguram o checkout além de 5s', async () => {
    const requests: unknown[] = []
    const client = {
      customers: {
        retrieve: async (_id: string, _params: unknown, request: unknown) => {
          requests.push(request)
          return { id: 'cus_1', address: null }
        },
        update: async (_id: string, _params: unknown, request: unknown) => {
          requests.push(request)
        }
      }
    } as unknown as Stripe
    await prefillCustomer(client, 'cus_1', 'Dona do Bar', {
      name: 'Bar da Dona',
      address: 'Rua A, 1',
      neighborhood: 'Centro',
      city: 'São Paulo',
      uf: 'SP'
    })
    const quick = { timeout: 5000, maxNetworkRetries: 0 }
    expect(requests).toEqual([quick, quick])
  })
})

/** Cliente do Stripe dublado: guarda as chamadas e os `br_cnpj` que tem. */
function customerWith(taxIds: { id: string; type: string; value: string }[]) {
  const calls: unknown[][] = []
  const client = {
    customers: {
      retrieve: async () => ({ id: 'cus_1', address: { line1: 'x' } }),
      update: async (...args: unknown[]) => {
        calls.push(['update', args[0], args[1]])
      },
      listTaxIds: async () => ({ data: taxIds }),
      deleteTaxId: async (_c: string, id: string) => {
        calls.push(['deleteTaxId', id])
      },
      createTaxId: async (_c: string, params: unknown) => {
        calls.push(['createTaxId', params])
      }
    }
  } as unknown as Stripe
  return { client, calls }
}

describe('dados da nota no cliente do Stripe (WEB-444)', () => {
  const ownerBar = {
    name: 'Bar do Zé',
    address: 'Rua Augusta, 100',
    neighborhood: 'Consolação',
    city: 'São Paulo',
    uf: 'SP'
  }
  const owner = { name: 'Zé Dono', email: 'ze@bar.com' }

  it('razão social vira a empresa e o e-mail para notas, o do cliente', () => {
    expect(
      customerPrefillFor({ address: { line1: 'x' } }, 'Zé Dono', {
        ...ownerBar,
        legalName: 'Bar do Zé Comércio de Bebidas Ltda.',
        invoiceEmail: 'financeiro@bar.com'
      })
    ).toEqual({
      name: 'Zé Dono',
      individual_name: 'Zé Dono',
      business_name: 'Bar do Zé Comércio de Bebidas Ltda.',
      email: 'financeiro@bar.com'
    })
  })

  it('salvar no painel: troca o CNPJ antigo pelo novo e manda os nomes e o e-mail', async () => {
    const { client, calls } = customerWith([
      { id: 'txi_velho', type: 'br_cnpj', value: '11.444.777/0001-61' },
      { id: 'txi_cpf', type: 'br_cpf', value: '123.456.789-09' }
    ])
    await pushInvoiceDetails(client, 'cus_1', owner, {
      name: 'Bar do Zé',
      legalName: 'Zé Ltda.',
      cnpj: '11222333000181',
      invoiceEmail: null
    })
    expect(calls).toEqual([
      [
        'update',
        'cus_1',
        {
          name: 'Zé Dono',
          individual_name: 'Zé Dono',
          business_name: 'Zé Ltda.',
          email: 'ze@bar.com'
        }
      ],
      ['deleteTaxId', 'txi_velho'],
      ['createTaxId', { type: 'br_cnpj', value: '11.222.333/0001-81' }]
    ])
  })

  it('o mesmo CNPJ de novo não muda nada; CNPJ apagado sai do Stripe', async () => {
    const same = customerWith([
      { id: 'txi_1', type: 'br_cnpj', value: '11.222.333/0001-81' }
    ])
    const details = {
      name: 'Bar do Zé',
      legalName: null,
      cnpj: '11222333000181',
      invoiceEmail: 'nf@bar.com'
    }
    await pushInvoiceDetails(same.client, 'cus_1', owner, details)
    expect(same.calls.map(([kind]) => kind)).toEqual(['update'])

    const cleared = customerWith([
      { id: 'txi_1', type: 'br_cnpj', value: '11.222.333/0001-81' }
    ])
    await pushInvoiceDetails(cleared.client, 'cus_1', owner, {
      ...details,
      cnpj: null
    })
    expect(cleared.calls.slice(1)).toEqual([['deleteTaxId', 'txi_1']])
  })

  it('checkout sem CNPJ no painel não mexe no CNPJ do cliente', async () => {
    const { client, calls } = customerWith([
      { id: 'txi_1', type: 'br_cnpj', value: '11.222.333/0001-81' }
    ])
    await prefillCustomer(client, 'cus_1', 'Zé Dono', ownerBar)
    expect(calls.map(([kind]) => kind)).toEqual(['update'])
  })
})
