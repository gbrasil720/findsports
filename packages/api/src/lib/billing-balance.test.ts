import { describe, expect, it } from 'bun:test'
import { readBillingBalance } from './billing-balance'

type Client = Parameters<typeof readBillingBalance>[0]

/** Stripe dublado: saldo do cliente e valor da próxima fatura, em centavos. */
function stripeWith(options: {
  balance?: number | Error
  amountDue?: number | Error
}) {
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
      retrieve: () =>
        answer('subscriptions.retrieve', options.balance, {
          customer: { id: 'cus_1', balance: options.balance ?? 0 }
        })
    },
    invoices: {
      createPreview: () =>
        answer('invoices.createPreview', options.amountDue, {
          amount_due: options.amountDue ?? 0
        })
    }
  } as unknown as Client
  return { client, calls }
}

describe('saldo e próxima cobrança no Stripe (WEB-350)', () => {
  it('saldo negativo vira crédito positivo em reais', async () => {
    const { client } = stripeWith({ balance: -19870, amountDue: 0 })
    expect(await readBillingBalance(client, 'sub_1')).toEqual({
      creditReais: 198.7,
      nextChargeReais: 0
    })
  })

  it('sem saldo: só o valor da próxima cobrança', async () => {
    const { client } = stripeWith({ balance: 0, amountDue: 6900 })
    expect(await readBillingBalance(client, 'sub_1')).toEqual({
      creditReais: null,
      nextChargeReais: 69
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
    ).toEqual({ creditReais: null, nextChargeReais: null })
    expect(
      await readBillingBalance(
        stripeWith({ balance: -4967, amountDue: down }).client,
        'sub_1'
      )
    ).toEqual({ creditReais: 49.67, nextChargeReais: null })
  })

  it('sem assinatura no Stripe: nenhuma chamada', async () => {
    const { client, calls } = stripeWith({ balance: -100 })
    expect(await readBillingBalance(client, null)).toBeNull()
    expect(calls).toEqual([])
  })
})
