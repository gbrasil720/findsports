import { describe, expect, it } from 'bun:test'
import { pixExternalId } from './pix-sync'
import { readPixWebhook, signatureFor } from './pix-webhook'

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'

// O formato do `subscription.completed` dos docs ("Eventos de assinatura"),
// com os campos que o Pix traz. Só `event`, `data.subscription.id` e
// `data.checkout.externalId` são lidos; o resto está aqui para o teste
// quebrar se a leitura passar a depender de outra forma.
const externalId = pixExternalId('bar-1', 'pro', true)
const completed = {
  id: 'log_12345abcdef',
  event: 'subscription.completed',
  apiVersion: 2,
  devMode: false,
  data: {
    subscription: {
      id: 'subs_abc123',
      amount: 11900,
      currency: 'BRL',
      method: 'PIX',
      status: 'ACTIVE',
      frequency: 'MONTHLY',
      createdAt: '2026-11-11T23:10:00.000Z',
      updatedAt: '2026-11-11T23:10:00.000Z',
      canceledAt: null,
      cancelPolicy: null,
      cancelledDueTo: null
    },
    customer: {
      id: 'cust_abc123',
      name: 'Bar de Teste',
      email: 'bar@exemplo.com',
      taxId: '123.***.***-**'
    },
    checkout: {
      id: 'bill_abc123',
      externalId,
      amount: 11900,
      status: 'PAID',
      methods: ['PIX'],
      items: [{ id: 'prod_abc', quantity: 1 }]
    },
    payment: { id: 'pix_char_abc', amount: 11900, status: 'PAID' },
    payerInformation: { method: 'PIX' }
  }
}

async function read(
  body: unknown,
  overrides: Partial<Parameters<typeof readPixWebhook>[0]> = {}
) {
  const raw = JSON.stringify(body)
  return readPixWebhook({
    raw,
    secretHeader: SECRET,
    secretQuery: null,
    signature: await signatureFor(raw),
    secret: SECRET,
    ...overrides
  })
}

describe('webhook do Pix', () => {
  it('lê o evento de assinatura dos docs', async () => {
    expect(await read(completed)).toEqual({
      status: 200,
      ignored: false,
      event: 'subscription.completed',
      subscriptionId: 'subs_abc123',
      externalId
    })
  })

  it('aceita o segredo pela query, como a AbacatePay também manda', async () => {
    const result = await read(completed, {
      secretHeader: null,
      secretQuery: SECRET
    })
    expect(result.status).toBe(200)
  })

  it('recusa segredo diferente do Worker, com o motivo', async () => {
    expect(await read(completed, { secretHeader: 'outro' })).toEqual({
      status: 401,
      reason: 'secret'
    })
  })

  it('recusa corpo alterado depois de assinado', async () => {
    const signature = await signatureFor(JSON.stringify(completed))
    const tampered = { ...completed, event: 'subscription.cancelled' }
    expect(await read(tampered, { signature })).toEqual({
      status: 401,
      reason: 'signature'
    })
  })

  it('ignora evento que não é de assinatura', async () => {
    expect(await read({ ...completed, event: 'checkout.completed' })).toEqual({
      status: 200,
      ignored: true
    })
  })
})
