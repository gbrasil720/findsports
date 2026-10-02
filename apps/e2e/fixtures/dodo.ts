import { createHmac, randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { DODO_WEBHOOK_SECRET } from '../env'

/**
 * Entrega um webhook da Dodo assinado como a Dodo assina (Standard Webhooks:
 * HMAC-SHA256 de `id.timestamp.corpo` com o segredo em base64 depois do
 * `whsec_`). O servidor de E2E tem o mesmo segredo, então o plugin aceita.
 *
 * O corpo precisa passar no esquema do `@dodopayments/core`
 * (`WebhookPayloadSchema`); um corpo inválido volta 400 depois da assinatura.
 */
export async function sendDodoWebhook(
  request: APIRequestContext,
  payload: unknown,
  { secret = DODO_WEBHOOK_SECRET }: { secret?: string } = {}
) {
  const body = JSON.stringify(payload)
  const id = `msg_${randomUUID()}`
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')

  return request.post('/api/auth/dodopayments/webhooks', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`
    }
  })
}
