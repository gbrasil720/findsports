import { describe, expect, it } from 'bun:test'
import { readBillingBalance } from './billing-balance'

type Client = Parameters<typeof readBillingBalance>[0]

/** Stripe dublado: saldo do cliente e valor da próxima fatura, em centavos. */
function stripeWith(options: {
  balance?: number | Error
  amountDue?: number | Error
  /** Forma de pagamento padrão da assinatura e a do cliente. */
  subscriptionMethod?: unknown
  customerMethod?: unknown
}) {
  const expands: string[][] = []
  const calls: string[] = []
  const answer = (
    name: string,
    value: number | Error | undefined,
    body: object
  ) => {
    calls.push(name)
    return value instanceof Error
      ? Promise.reject(value)
      : Promise.resolve(body)
  }
  const client = {
    subscriptions: {
      retrieve: (_id: string, params: { expand: string[] }) => {
        expands.push(params.expand)
        return answer('subscriptions.retrieve', options.balance, {
          default_payment_method: options.subscriptionMethod ?? null,
          customer: {
            id: 'cus_1',
            balance: options.balance ?? 0,
            invoice_settings: {
              default_payment_method: options.customerMethod ?? null
            }
          }
        })
      }
    },
    invoices: {
      createPreview: () =>
        answer('invoices.createPreview', options.amountDue, {
          amount_due: options.amountDue ?? 0
        })
    }
  } as unknown as Client
  return { client, calls, expands }
}

describe('saldo e próxima cobrança no Stripe (WEB-350)', () => {
  it('saldo negativo vira crédito positivo em reais', async () => {
    const { client } = stripeWith({ balance: -19870, amountDue: 0 })
    expect(await readBillingBalance(client, 'sub_1')).toEqual({
      creditReais: 198.7,
      nextChargeReais: 0,
      card: null
    })
  })

  it('sem saldo: só o valor da próxima cobrança', async () => {
    const { client } = stripeWith({ balance: 0, amountDue: 6900 })
    expect(await readBillingBalance(client, 'sub_1')).toEqual({
      creditReais: null,
      nextChargeReais: 69,
      card: null
    })
  })

  it('saldo positivo é dívida, não crédito', async () => {
    const { client } = stripeWith({ balance: 500, amountDue: 7400 })
    expect((await readBillingBalance(client, 'sub_1'))?.creditReais).toBeNull()
  })

  it('erro do Stripe não sai daqui, e uma leitura não esconde a outra', async () => {
    const down = new Error('stripe fora')
    expect(
      await readBillingBalance(
        stripeWith({ balance: down, amountDue: down }).client,
        'sub_1'
      )
    ).toEqual({ creditReais: null, nextChargeReais: null, card: null })
    expect(
      await readBillingBalance(
        stripeWith({ balance: -4967, amountDue: down }).client,
        'sub_1'
      )
    ).toEqual({ creditReais: 49.67, nextChargeReais: null, card: null })
  })

  it('sem assinatura no Stripe: nenhuma chamada', async () => {
    const { client, calls } = stripeWith({ balance: -100 })
    expect(await readBillingBalance(client, null)).toBeNull()
    expect(calls).toEqual([])
  })

  // Como o Stripe devolve a forma de pagamento expandida. Do cartão, só
  // bandeira e últimos 4 dígitos podem sair.
  const visa = {
    id: 'pm_1',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2030,
      fingerprint: 'fp_1',
      country: 'BR'
    }
  }

  it('cartão da assinatura: só bandeira e últimos 4 dígitos, na mesma leitura', async () => {
    const { client, calls, expands } = stripeWith({
      amountDue: 6900,
      subscriptionMethod: visa
    })
    expect((await readBillingBalance(client, 'sub_1'))?.card).toEqual({
      brand: 'visa',
      last4: '4242'
    })
    expect(calls.toSorted()).toEqual([
      'invoices.createPreview',
      'subscriptions.retrieve'
    ])
    expect(expands).toEqual([
      [
        'default_payment_method',
        'customer.invoice_settings.default_payment_method'
      ]
    ])
  })

  it('assinatura sem cartão próprio: vale o padrão do cliente', async () => {
    const { client } = stripeWith({
      customerMethod: { ...visa, card: { ...visa.card, last4: '1881' } }
    })
    expect((await readBillingBalance(client, 'sub_1'))?.card).toEqual({
      brand: 'visa',
      last4: '1881'
    })
  })

  it('sem cartão, forma de pagamento que não é cartão ou não expandida: nada', async () => {
    for (const subscriptionMethod of [
      null,
      { id: 'pm_2', type: 'boleto' },
      'pm_1'
    ]) {
      const { client } = stripeWith({ subscriptionMethod })
      expect((await readBillingBalance(client, 'sub_1'))?.card).toBeNull()
    }
  })

  it('falha na leitura da assinatura: sem cartão', async () => {
    const { client } = stripeWith({
      balance: new Error('stripe fora'),
      subscriptionMethod: visa
    })
    expect((await readBillingBalance(client, 'sub_1'))?.card).toBeNull()
  })
})
