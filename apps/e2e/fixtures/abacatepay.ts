import { createHmac } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { ABACATE_PAY_WEBHOOK_SECRET, STUB_URL } from '../env'

/** Põe uma assinatura Pix ativa na "AbacatePay" (o stub), paga até `paidUntil`. */
export async function seedPixSubscription(
  request: APIRequestContext,
  id: string,
  paidUntil: Date
) {
  const seeded = await request.post(`${STUB_URL}/abacatepay/subscriptions`, {
    data: { id, currentPeriodEnd: paidUntil.toISOString() }
  })
  if (!seeded.ok()) throw new Error('stub da AbacatePay recusou a assinatura')
}

/** Ids das assinaturas que o app mandou cancelar na AbacatePay. */
export async function pixCancels(request: APIRequestContext) {
  const calls = (await (
    await request.get(`${STUB_URL}/abacatepay/calls`)
  ).json()) as { path: string; body: { id?: string } | null }[]
  return calls
    .filter((call) => call.path === '/subscriptions/cancel')
    .map((call) => call.body?.id)
}

/** O que o app pediu à "AbacatePay" (o stub), em ordem. */
export async function pixCalls(request: APIRequestContext) {
  return (await (await request.get(`${STUB_URL}/abacatepay/calls`)).json()) as {
    method: string
    path: string
    body: Record<string, unknown> | null
  }[]
}

/**
 * Chave pública da assinatura HMAC dos avisos, a mesma de todas as contas
 * (`packages/auth/src/pix-webhook.ts`, docs da AbacatePay).
 */
const SIGNATURE_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9'

/**
 * Entrega um aviso de assinatura como a AbacatePay: segredo do webhook no
 * cabeçalho e o corpo assinado. O app relê a assinatura no stub, então ela
 * precisa estar semeada (`seedPixSubscription`).
 */
export async function deliverPixWebhook(
  request: APIRequestContext,
  event: string,
  subscriptionId: string,
  externalId: string
) {
  const body = JSON.stringify({
    event,
    data: { subscription: { id: subscriptionId }, checkout: { externalId } }
  })
  return request.post('/api/abacatepay/webhook', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': ABACATE_PAY_WEBHOOK_SECRET,
      'x-webhook-signature': createHmac('sha256', SIGNATURE_KEY)
        .update(body)
        .digest('base64')
    }
  })
}
