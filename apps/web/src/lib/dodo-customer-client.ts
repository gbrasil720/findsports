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
  if (
    !isRecord(payment) ||
    typeof payment.payment_id !== 'string' ||
    typeof payment.total_amount !== 'number' ||
    typeof payment.created_at !== 'string'
  ) {
    throw new Error('Resposta de pagamento inválida')
  }
  return {
    paymentId: payment.payment_id,
    status: String(payment.status),
    totalAmount: payment.total_amount,
    createdAt: payment.created_at
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
