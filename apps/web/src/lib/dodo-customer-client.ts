import { authClient } from './auth-client'

export type CustomerPayment = {
  paymentId: string
  status: string
  totalAmount: number
  createdAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeCustomerPayment(payment: unknown): CustomerPayment {
  const invalid = new Error('Resposta de pagamento inválida')
  if (!isRecord(payment)) throw invalid
  // O cliente do better-auth converte toda string ISO da resposta em `Date`:
  // o `created_at` da Dodo chega aqui como `Date`.
  const createdAt =
    payment.created_at instanceof Date
      ? payment.created_at.toISOString()
      : payment.created_at
  if (
    typeof payment.payment_id !== 'string' ||
    typeof payment.total_amount !== 'number' ||
    typeof createdAt !== 'string'
  ) {
    throw invalid
  }
  return {
    paymentId: payment.payment_id,
    status: String(payment.status),
    totalAmount: payment.total_amount,
    createdAt
  }
}

export function normalizeCustomerPayments(payload: unknown): CustomerPayment[] {
  if (payload == null) return []
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('Lista de pagamentos inválida')
  }
  return payload.items.map(normalizeCustomerPayment)
}

export function normalizePortalUrl(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.url === 'string'
    ? payload.url
    : null
}

export async function listCustomerPayments(): Promise<CustomerPayment[]> {
  const { data, error } = await authClient.dodopayments.customer.payments.list({
    query: { limit: 10, page: 1 }
  })
  if (error) throw error
  return normalizeCustomerPayments(data)
}

export async function getCustomerPortalUrl(): Promise<string | null> {
  const { data, error } = await authClient.dodopayments.customer.portal()
  if (error) throw error
  return normalizePortalUrl(data)
}
