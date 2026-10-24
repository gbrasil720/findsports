import { z } from 'zod'

/**
 * "Por que está cancelando?" (WEB-445, 3q): um motivo, opcional, sem texto
 * livre ("Outro" não abre campo, o design não tem). O id fica gravado em
 * `subscription_cancel_reason.reason`, então nunca é reusado; a posição na
 * lista é a ordem da tela.
 */
export const CANCEL_REASONS = [
  { id: 'low_traffic', label: 'Pouco movimento' },
  { id: 'too_expensive', label: 'Muito caro' },
  { id: 'paused', label: 'Fechei por um tempo' },
  { id: 'other', label: 'Outro' }
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
