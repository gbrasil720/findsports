import { handleAnalyticsRetentionCron } from '@findsports_oficial/api/lib/commercial-analytics/retention-cron'
import { createFileRoute } from '@tanstack/react-router'

// WEB-117: disparada uma vez por dia pelo cron da Vercel
// (`apps/web/scripts/build-vercel.mjs`).
export const Route = createFileRoute('/api/cron/analytics-retention')({
  server: {
    handlers: {
      GET: ({ request }) => handleAnalyticsRetentionCron(request)
    }
  }
})
