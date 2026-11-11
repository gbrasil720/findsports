import { appStatusResponse } from '@findsports_oficial/api/lib/app-status'
import { createFileRoute } from '@tanstack/react-router'

/** WEB-466: a manutenção do app, sem sessão (ver `lib/app-status.ts`). */
export const Route = createFileRoute('/api/app/status')({
  server: { handlers: { GET: () => appStatusResponse() } }
})
