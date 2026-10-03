import { handleAnalyticsRetentionCron } from '@findsports_oficial/api/lib/commercial-analytics/retention'
import { createFileRoute } from '@tanstack/react-router'

// WEB-117: era disparada pelo cron da Vercel. Desde o corte (WEB-205) a
// retenção roda no Cron Trigger do Worker (WEB-203) e nada chama esta rota;
// ela sai no WEB-206.
export const Route = createFileRoute('/api/cron/analytics-retention')({
  server: {
    handlers: {
      GET: ({ request }) => handleAnalyticsRetentionCron(request)
    }
  }
})
