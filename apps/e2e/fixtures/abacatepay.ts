import type { APIRequestContext } from '@playwright/test'
import { STUB_URL } from '../env'

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
