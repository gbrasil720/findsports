import {
  createOnsideEmailTemplate,
  sendEmailWithResend
} from '@findsports_oficial/auth/verification-email'
import {
  EMAIL_HERO_IMAGE_URL,
  EMAIL_LOGO_URL
} from '@findsports_oficial/config/site'
import { env } from '@findsports_oficial/env/server'
import type { SupportPriority } from './support-priority'

export const SUPPORT_INBOX = 'contato@onside.sh'

export function getSupportQueueUrl(
  publicAppUrl: string | undefined,
  fallbackUrl: string
): string {
  return new URL(
    '/internal/support',
    publicAppUrl?.trim() || fallbackUrl
  ).toString()
}

const PRIORITY_LABEL: Record<SupportPriority, string> = {
  standard: 'Starter',
  priority: 'Pro',
  highest: 'Elite'
}

export type SupportRequestEmailInput = {
  id: string
  barName: string
  barEmail: string
  plan: 'starter' | 'pro' | 'elite'
  priority: SupportPriority
  category: string
  subject: string
  description: string
  url: string
}

export function createSupportRequestEmail(input: SupportRequestEmailInput) {
  const template = createOnsideEmailTemplate({
    preheader: `Nova solicitação de suporte ${PRIORITY_LABEL[input.priority]} da ${input.barName}.`,
    eyebrow: `Suporte ${PRIORITY_LABEL[input.priority]}`,
    heading: input.subject,
    intro: `A ${input.barName} abriu uma solicitação pelo painel do bar.`,
    highlights: [
      `Plano vigente: ${input.plan}`,
      `Categoria: ${input.category}`,
      `E-mail do bar: ${input.barEmail}`,
      `Solicitação: ${input.id}`,
      input.description
    ],
    action: 'Abrir fila de suporte',
    actionUrl: input.url,
    logoUrl: EMAIL_LOGO_URL,
    heroImageUrl: EMAIL_HERO_IMAGE_URL,
    note: 'A prioridade desta solicitação é recalculada a partir do plano vigente do bar na fila interna.'
  })

  return {
    subject: `[Suporte ${PRIORITY_LABEL[input.priority]}] ${input.subject}`,
    ...template
  }
}

export async function sendSupportRequestEmail(
  input: SupportRequestEmailInput
): Promise<{ delivered: boolean }> {
  const email = createSupportRequestEmail(input)
  return sendEmailWithResend({
    apiKey: env.RESEND_API_KEY,
    fromEmail: env.RESEND_FROM_EMAIL,
    to: SUPPORT_INBOX,
    subject: email.subject,
    text: email.text,
    html: email.html,
    idempotencyKey: `support-request-${input.id}`
  })
}
