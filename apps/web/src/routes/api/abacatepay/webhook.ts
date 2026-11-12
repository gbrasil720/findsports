import { handlePixWebhook } from '@findsports_oficial/auth/pix-webhook'
import { createFileRoute } from '@tanstack/react-router'

/** Pix Automático: eventos de assinatura da AbacatePay (`lib/pix`). */
export const Route = createFileRoute('/api/abacatepay/webhook')({
  server: { handlers: { POST: ({ request }) => handlePixWebhook(request) } }
})
