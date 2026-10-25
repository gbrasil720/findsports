import { z } from 'zod'

/**
 * "Por que está cancelando?" (WEB-445, 3q): um motivo, opcional, sem texto
 * livre ("Outro" não abre campo, o design não tem). O id fica gravado em
 * `subscription_cancel_reason.reason`, então nunca é reusado; a posição na
 * lista é a ordem da tela.
 *
 * `stripeFeedback` é o `cancellation_details.feedback` que o webhook grava na
 * assinatura do Stripe quando o cancelamento se confirma (`stripe-sync.ts`):
 * o mais perto da lista fechada do Stripe; o texto exato vai no comentário.
 * Mora em `db` porque o `auth` (webhook) e o `api` (tela) leem a mesma lista.
 */
export const CANCEL_REASONS = [
  { id: 'low_traffic', label: 'Pouco movimento', stripeFeedback: 'other' },
  { id: 'too_expensive', label: 'Muito caro', stripeFeedback: 'too_expensive' },
  { id: 'paused', label: 'Fechei por um tempo', stripeFeedback: 'unused' },
  { id: 'other', label: 'Outro', stripeFeedback: 'other' }
] as const

export type CancelReasonId = (typeof CANCEL_REASONS)[number]['id']

export const cancelReasonSchema = z.enum(
  CANCEL_REASONS.map((reason) => reason.id) as [
    CancelReasonId,
    ...CancelReasonId[]
  ]
)

export const cancelReasonLabel = (id: string) =>
  CANCEL_REASONS.find((reason) => reason.id === id)?.label ?? id
