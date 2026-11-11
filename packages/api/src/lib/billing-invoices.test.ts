import { describe, expect, it } from 'bun:test'
import { readInvoices } from './billing-invoices'

type Client = Parameters<typeof readInvoices>[0]

const OCT_1 = Date.UTC(2026, 9, 1) / 1000
const OCT_12 = Date.UTC(2026, 9, 12, 15) / 1000
const NOV_12 = Date.UTC(2026, 10, 12) / 1000

/** Fatura como o Stripe lista, só com o que o app lê. Valores em centavos. */
function invoice(fields: {
  id: string
  status: string
  total: number
  created: number
  paidAt?: number
  attempts?: number
  lineEnd?: number
}) {
  return {
    id: fields.id,
    status: fields.status,
    total: fields.total,
    created: fields.created,
    customer: 'cus_1',
    attempt_count: fields.attempts ?? 0,
    status_transitions: { paid_at: fields.paidAt ?? null },
    lines: {
      data: [
        { period: { start: fields.created, end: fields.lineEnd ?? NOV_12 } }
      ]
    },
    invoice_pdf: `https://pay.stripe.com/invoice/${fields.id}/pdf`
  }
}

function stripeWith(options: {
  invoices: ReturnType<typeof invoice>[] | Error
  charges?: { status: string; created: number }[] | Error
}) {
  const calls: { name: string; params: unknown }[] = []
  const answer = (name: string, params: unknown, value: unknown[] | Error) => {
    calls.push({ name, params })
    return value instanceof Error
      ? Promise.reject(value)
      : Promise.resolve({ data: value })
  }
  const client = {
    invoices: {
      list: (params: unknown) =>
        answer('invoices.list', params, options.invoices)
    },
    charges: {
      list: (params: unknown) =>
        answer('charges.list', params, options.charges ?? [])
    }
  } as unknown as Client
  return { client, calls }
}

describe('faturas da assinatura no Stripe (WEB-443)', () => {
  it('paga, teste de R$ 0 e PDF; rascunho e anulada ficam de fora', async () => {
    const { client, calls } = stripeWith({
      invoices: [
        invoice({
          id: 'in_out',
          status: 'paid',
          total: 26900,
          created: OCT_12,
          paidAt: OCT_12
        }),
        invoice({
          id: 'in_rascunho',
          status: 'draft',
          total: 26900,
          created: OCT_12
        }),
        invoice({
          id: 'in_anulada',
          status: 'void',
          total: 26900,
          created: OCT_1
        }),
        invoice({
          id: 'in_teste',
          status: 'paid',
          total: 0,
          created: OCT_1,
          paidAt: OCT_1,
          lineEnd: OCT_12
        })
      ]
    })

    expect(await readInvoices(client, 'sub_1')).toEqual({
      invoices: [
        {
          id: 'in_out',
          createdAt: new Date(OCT_12 * 1000),
          amountReais: 269,
          situation: 'paid',
          paidAt: new Date(OCT_12 * 1000),
          failedAt: null,
          trialEndsAt: null,
          pdfUrl: 'https://pay.stripe.com/invoice/in_out/pdf'
        },
        {
          id: 'in_teste',
          createdAt: new Date(OCT_1 * 1000),
          amountReais: 0,
          situation: 'trial',
          paidAt: new Date(OCT_1 * 1000),
          failedAt: null,
          trialEndsAt: new Date(OCT_12 * 1000),
          pdfUrl: 'https://pay.stripe.com/invoice/in_teste/pdf'
        }
      ],
      lastFailedChargeAt: null
    })
    // Sem fatura pendente, as cobranças nem são lidas.
    expect(calls.map((call) => call.name)).toEqual(['invoices.list'])
    expect(calls[0]?.params).toEqual({ subscription: 'sub_1', limit: 12 })
  })

  it('pendente tentada: a data é a da última cobrança recusada depois dela', async () => {
    const { client, calls } = stripeWith({
      invoices: [
        invoice({
          id: 'in_out',
          status: 'open',
          total: 26900,
          created: OCT_1,
          attempts: 2
        })
      ],
      charges: [
        { status: 'failed', created: OCT_12 },
        { status: 'failed', created: OCT_1 + 3600 },
        // Recusa de antes da fatura é de outra cobrança.
        { status: 'failed', created: OCT_1 - 86_400 }
      ]
    })

    const read = await readInvoices(client, 'sub_1')
    expect(read?.invoices[0]?.situation).toBe('pending')
    expect(read?.invoices[0]?.failedAt).toEqual(new Date(OCT_12 * 1000))
    expect(read?.lastFailedChargeAt).toEqual(new Date(OCT_12 * 1000))
    expect(calls[1]).toEqual({
      name: 'charges.list',
      params: { customer: 'cus_1', limit: 10 }
    })
  })

  it('pendente sem recusa registrada, ou ainda não tentada: sem data', async () => {
    const tried = stripeWith({
      invoices: [
        invoice({
          id: 'in_1',
          status: 'open',
          total: 26900,
          created: OCT_12,
          attempts: 1
        })
      ],
      charges: [{ status: 'succeeded', created: OCT_12 }]
    })
    expect(
      (await readInvoices(tried.client, 'sub_1'))?.lastFailedChargeAt
    ).toBeNull()

    const waiting = stripeWith({
      invoices: [
        invoice({ id: 'in_1', status: 'open', total: 26900, created: OCT_12 })
      ]
    })
    expect(
      (await readInvoices(waiting.client, 'sub_1'))?.lastFailedChargeAt
    ).toBeNull()
    expect(waiting.calls.map((call) => call.name)).toEqual(['invoices.list'])
  })

  it('falha nas cobranças só tira a data; falha na lista não sai daqui', async () => {
    const down = new Error('stripe fora')
    const charges = stripeWith({
      invoices: [
        invoice({
          id: 'in_1',
          status: 'open',
          total: 26900,
          created: OCT_12,
          attempts: 1
        })
      ],
      charges: down
    })
    const read = await readInvoices(charges.client, 'sub_1')
    expect(read?.invoices).toHaveLength(1)
    expect(read?.lastFailedChargeAt).toBeNull()

    expect(
      await readInvoices(stripeWith({ invoices: down }).client, 'sub_1')
    ).toBeNull()
  })

  it('sem assinatura no Stripe: nenhuma chamada', async () => {
    const { client, calls } = stripeWith({ invoices: [] })
    expect(await readInvoices(client, null)).toBeNull()
    expect(calls).toEqual([])
  })
})
