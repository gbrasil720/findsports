import { env } from '@findsports_oficial/env/server'

/**
 * Cliente mínimo da API v2 da AbacatePay, o provedor do Pix Automático.
 * Só as rotas que a assinatura do bar usa; o modo (teste ou produção) vem
 * da chave, como no Stripe.
 */

const BASE_URL = 'https://api.abacatepay.com/v2'
// Mesma régua do Stripe (`QUICK_REQUEST`): a tela não espera mais que isso.
const TIMEOUT_MS = 8000

export class AbacatePayError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'AbacatePayError'
  }
}

export function pixEnabled(): boolean {
  return Boolean(env.ABACATE_PAY_API_KEY)
}

async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  const key = env.ABACATE_PAY_API_KEY
  if (!key) throw new AbacatePayError('Pix desligado: falta a chave.', 503)
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  const payload = (await response.json().catch(() => null)) as {
    data: T | null
    error: string | null
  } | null
  if (!response.ok || !payload || payload.error || payload.data === null) {
    throw new AbacatePayError(
      payload?.error ?? `AbacatePay respondeu ${response.status}`,
      response.status
    )
  }
  return payload.data
}

export type AbacateSubscription = {
  id: string
  checkoutId: string | null
  customerId: string
  amount: number
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED'
  method: 'PIX' | 'CARD'
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  nextChargeAt?: string | null
}

export type AbacateCheckout = {
  id: string
  url: string
  externalId: string | null
  status: string
}

// O id do produto não muda; um isolate do Worker só o busca uma vez.
const productIds = new Map<string, string>()

export async function productIdFor(externalId: string): Promise<string> {
  const cached = productIds.get(externalId)
  if (cached) return cached
  const product = await call<{ id: string }>(
    `/products/get?externalId=${encodeURIComponent(externalId)}`
  )
  productIds.set(externalId, product.id)
  return product.id
}

/**
 * Acha ou cria o cliente (a API procura por CPF/CNPJ, e-mail e celular). Sem
 * documento: o checkout pede "CPF ou CNPJ" de quem paga.
 */
export async function upsertCustomer(customer: {
  email: string
  name: string
}): Promise<string> {
  const created = await call<{ id: string }>('/customers/create', {
    method: 'POST',
    body: { email: customer.email, name: customer.name }
  })
  return created.id
}

export function createPixSubscriptionCheckout(input: {
  productId: string
  customerId: string
  externalId: string
  completionUrl: string
  returnUrl: string
}): Promise<AbacateCheckout> {
  return call<AbacateCheckout>('/subscriptions/create', {
    method: 'POST',
    body: {
      items: [{ id: input.productId, quantity: 1 }],
      methods: ['PIX'],
      customerId: input.customerId,
      externalId: input.externalId,
      completionUrl: input.completionUrl,
      returnUrl: input.returnUrl
    }
  })
}

export function getSubscription(id: string): Promise<AbacateSubscription> {
  return call<AbacateSubscription>(
    `/subscriptions/get?id=${encodeURIComponent(id)}`
  )
}

export function getSubscriptionCheckout(id: string): Promise<AbacateCheckout> {
  return call<AbacateCheckout>(
    `/subscriptions/checkouts/get?id=${encodeURIComponent(id)}`
  )
}

export function cancelSubscription(id: string): Promise<AbacateSubscription> {
  return call<AbacateSubscription>('/subscriptions/cancel', {
    method: 'POST',
    body: { id }
  })
}

// ── Configuração da conta: usado por `bun run pix:check` e `pix:setup`. ──

export type AbacateWebhook = {
  id: string
  name: string
  endpoint: string
  events: string[]
  devMode: boolean
}

export type AbacateProduct = {
  id: string
  externalId: string | null
  price: number
  currency: string
  cycle: string | null
  status: string
}

export function listWebhooks(): Promise<AbacateWebhook[]> {
  return call<AbacateWebhook[]>('/webhooks/list')
}

/** O segredo só existe aqui: a API não o devolve depois. */
export function createWebhook(input: {
  name: string
  endpoint: string
  secret: string
  events: string[]
}): Promise<AbacateWebhook> {
  return call<AbacateWebhook>('/webhooks/create', {
    method: 'POST',
    body: input
  })
}

export function deleteWebhook(id: string): Promise<unknown> {
  return call(`/webhooks/delete?id=${encodeURIComponent(id)}`, {
    method: 'POST'
  })
}

export function getProduct(externalId: string): Promise<AbacateProduct> {
  return call<AbacateProduct>(
    `/products/get?externalId=${encodeURIComponent(externalId)}`
  )
}

export function deleteCustomer(id: string): Promise<unknown> {
  return call(`/customers/delete?id=${encodeURIComponent(id)}`, {
    method: 'POST'
  })
}

export function deleteSubscriptionCheckout(id: string): Promise<unknown> {
  return call(`/subscriptions/checkouts/delete?id=${encodeURIComponent(id)}`, {
    method: 'POST'
  })
}
