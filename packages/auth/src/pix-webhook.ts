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

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.completed',
  'subscription.renewed',
  'subscription.payment_failed',
  'subscription.cancelled'
])

/**
 * `POST /api/abacatepay/webhook`. 401 não gera reenvio; falha nossa (banco,
 * API fora) responde 500 e a AbacatePay tenta de novo.
 */
export async function handlePixWebhook(request: Request): Promise<Response> {
  const secret = env.ABACATE_PAY_WEBHOOK_SECRET
  if (!secret || !env.ABACATE_PAY_API_KEY) {
    return new Response('Pix desligado', { status: 503 })
  }
  const received =
    request.headers.get('x-webhook-secret') ??
    new URL(request.url).searchParams.get('webhookSecret') ??
    ''
  const raw = await request.text()
  const signature = request.headers.get('x-webhook-signature') ?? ''
  if (
    !safeEqual(received, secret) ||
    !safeEqual(signature, await signatureFor(raw))
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: WebhookBody
  try {
    body = JSON.parse(raw) as WebhookBody
  } catch {
    return new Response('Bad Request', { status: 400 })
  }
  const subscriptionId = body.data?.subscription?.id
  if (!body.event || !SUBSCRIPTION_EVENTS.has(body.event) || !subscriptionId) {
    // Os outros eventos (checkout.completed etc.) repetem o que a assinatura
    // já conta: recebidos e ignorados.
    return new Response('ok')
  }

  try {
    await applyPixSubscription(
      subscriptionId,
      body.data?.checkout?.externalId,
      body.event
    )
  } catch (error) {
    logBillingError('pix_webhook_failed', {
      event: body.event,
      subscriptionId,
      message: error instanceof Error ? error.message : String(error)
    })
    return new Response('Erro', { status: 500 })
  }
  return new Response('ok')
}
