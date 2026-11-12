import { env } from '@findsports_oficial/env/server'
import { applyPixSubscription } from './pix-sync'
import { logBillingError } from './stripe-sync'

/**
 * Chave pública da AbacatePay para a assinatura HMAC do corpo, a mesma para
 * todas as contas (docs: "Segurança dos webhooks"). Prova que o corpo chegou
 * intacto; quem prova a origem é o segredo do webhook.
 */
const ABACATEPAY_SIGNATURE_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9'

const encoder = new TextEncoder()

/** Comparação em tempo constante, sem o `node:crypto` (roda no Worker). */
function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

export async function signatureFor(rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ABACATEPAY_SIGNATURE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
}

type WebhookBody = {
  event?: string
  data?: {
    subscription?: { id?: string }
    checkout?: { externalId?: string | null }
  }
}

/** Os eventos que o webhook da Onside assina (`pix:setup`) e trata. */
export const PIX_WEBHOOK_EVENTS = [
  'subscription.completed',
  'subscription.renewed',
  'subscription.payment_failed',
  'subscription.cancelled'
] as const
const SUBSCRIPTION_EVENTS = new Set<string>(PIX_WEBHOOK_EVENTS)

export type PixWebhookRead =
  | { status: 401; reason: 'secret' | 'signature' }
  | { status: 400 }
  | { status: 200; ignored: true }
  | {
      status: 200
      ignored: false
      event: string
      subscriptionId: string
      externalId: string | null
    }

/**
 * Confere segredo e assinatura e lê o evento, sem banco nem rede: é o que
 * o teste de contrato exercita com o formato dos docs.
 */
export async function readPixWebhook(input: {
  raw: string
  secretHeader: string | null
  secretQuery: string | null
  signature: string | null
  secret: string
}): Promise<PixWebhookRead> {
  if (!safeEqual(input.secretHeader ?? input.secretQuery ?? '', input.secret)) {
    return { status: 401, reason: 'secret' }
  }
  if (!safeEqual(input.signature ?? '', await signatureFor(input.raw))) {
    return { status: 401, reason: 'signature' }
  }
  let body: WebhookBody
  try {
    body = JSON.parse(input.raw) as WebhookBody
  } catch {
    return { status: 400 }
  }
  const subscriptionId = body.data?.subscription?.id
  if (!body.event || !SUBSCRIPTION_EVENTS.has(body.event) || !subscriptionId) {
    // Os outros eventos (checkout.completed etc.) repetem o que a assinatura
    // já conta: recebidos e ignorados.
    return { status: 200, ignored: true }
  }
  return {
    status: 200,
    ignored: false,
    event: body.event,
    subscriptionId,
    externalId: body.data?.checkout?.externalId ?? null
  }
}

/**
 * `POST /api/abacatepay/webhook`. 401 não gera reenvio: por isso a recusa
 * vai ao log como erro de cobrança, com o motivo. Segredo recusado é quase
 * sempre o Worker e o webhook com segredos diferentes, que `pix:setup`
 * resolve. Falha nossa (banco, API fora) responde 500 e a AbacatePay tenta
 * de novo.
 */
export async function handlePixWebhook(request: Request): Promise<Response> {
  const secret = env.ABACATE_PAY_WEBHOOK_SECRET
  if (!secret || !env.ABACATE_PAY_API_KEY) {
    logBillingError('pix_webhook_disabled', {
      hasKey: Boolean(env.ABACATE_PAY_API_KEY),
      hasSecret: Boolean(secret)
    })
    return new Response('Pix desligado', { status: 503 })
  }
  const read = await readPixWebhook({
    raw: await request.text(),
    secretHeader: request.headers.get('x-webhook-secret'),
    secretQuery: new URL(request.url).searchParams.get('webhookSecret'),
    signature: request.headers.get('x-webhook-signature'),
    secret
  })
  if (read.status === 401) {
    logBillingError('pix_webhook_rejected', { reason: read.reason })
    return new Response('Unauthorized', { status: 401 })
  }
  if (read.status === 400) return new Response('Bad Request', { status: 400 })
  if (read.ignored) return new Response('ok')

  try {
    await applyPixSubscription(read.subscriptionId, read.externalId, read.event)
  } catch (error) {
    logBillingError('pix_webhook_failed', {
      event: read.event,
      subscriptionId: read.subscriptionId,
      message: error instanceof Error ? error.message : String(error)
    })
    return new Response('Erro', { status: 500 })
  }
  return new Response('ok')
}
