import { env } from '@findsports_oficial/env/server'

/**
 * Cliente mínimo da API v2 da AbacatePay, o provedor do Pix Automático.
 * Só as rotas que a assinatura do bar usa; o modo (teste ou produção) vem
 * da chave, como no Stripe.
 */

// Só o E2E muda isso (`ABACATE_PAY_API_BASE_URL`, recusada em produção).
const BASE_URL = `${env.ABACATE_PAY_API_BASE_URL ?? 'https://api.abacatepay.com'}/v2`
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

/**
 * Pix só aparece com a chave e o segredo do webhook: com a chave sozinha o
 * bar autorizaria, e o webhook recusaria todo aviso (503).
 */
export function pixEnabled(): boolean {
  return Boolean(env.ABACATE_PAY_API_KEY && env.ABACATE_PAY_WEBHOOK_SECRET)
}

type Page = { hasMore: boolean; next: string | null }

async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  return (await request<T>(path, init)).data
}

/** Todas as páginas de uma listagem (paginação por cursor, `after`). */
async function callAll<T>(path: string): Promise<T[]> {
  const items: T[] = []
  let after: string | null = null
  do {
    const separator = path.includes('?') ? '&' : '?'
    const page: { data: T[]; pagination?: Page } = await request<T[]>(
      after ? `${path}${separator}after=${encodeURIComponent(after)}` : path
    )
    items.push(...page.data)
    after = page.pagination?.hasMore ? page.pagination.next : null
  } while (after)
  return items
}

async function request<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<{ data: T; pagination?: Page }> {
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
    pagination?: Page
  } | null
  if (!response.ok || !payload || payload.error || payload.data === null) {
    throw new AbacatePayError(
      payload?.error ?? `AbacatePay respondeu ${response.status}`,
      response.status
    )
  }
  return { data: payload.data, pagination: payload.pagination }
}

export type AbacateSubscription = {
  id: string
  checkoutId: string | null
  customerId: string
  amount: number
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED'
  method: 'PIX' | 'CARD'
  createdAt: string
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

/**
 * Cancela na AbacatePay; já cancelada ou inexistente lá conta como feito, e
 * por isso repetir não quebra nada. O resto (rede, chave) lança.
 */
export async function cancelSubscriptionIfActive(id: string): Promise<void> {
  try {
    await cancelSubscription(id)
  } catch (error) {
    if (isNotActiveError(error)) return
    if (error instanceof AbacatePayError && error.status === 404) return
    throw error
  }
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
  return callAll<AbacateWebhook>('/webhooks/list?limit=100')
}

/** Já cancelada na AbacatePay: não há o que cancelar. */
export function isNotActiveError(error: unknown): boolean {
  return error instanceof AbacatePayError && /not active/i.test(error.message)
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

/** Produto de assinatura (`cycle`), achado depois pelo `externalId`. */
export function createProduct(input: {
  externalId: string
  name: string
  price: number
  cycle: 'MONTHLY' | 'ANNUALLY'
}): Promise<AbacateProduct> {
  return call<AbacateProduct>('/products/create', {
    method: 'POST',
    body: { ...input, currency: 'BRL' }
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
