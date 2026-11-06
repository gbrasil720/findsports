import { createFileRoute } from '@tanstack/react-router'
import { ScheduleTab } from '@/components/admin/schedule-tab'
import { PainelPage, usePainel } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/jogos')({
  head: () => ({ meta: [{ title: 'Jogos — Onside' }] }),
  component: JogosPage
})

function JogosPage() {
  const { analyticsRange } = usePainel()
  return (
    <PainelPage title="Jogos">
      <ScheduleTab analyticsRange={analyticsRange} />
    </PainelPage>
  )
}
