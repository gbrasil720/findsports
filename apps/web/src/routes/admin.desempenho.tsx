import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { OverviewTab } from '@/components/admin/overview-tab'
import { PainelPage, usePainel } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/desempenho')({
  head: () => ({ meta: [{ title: 'Desempenho — Onside' }] }),
  component: DesempenhoPage
})

// Fase 1 (WEB-501): os números da Visão geral antiga, no período escolhido.
function DesempenhoPage() {
  const painel = usePainel()
  const navigate = useNavigate()
  return (
    <PainelPage title="Desempenho">
      <OverviewTab
        onlyAnalytics
        analyticsRange={painel.analyticsRange}
        onAnalyticsRangeChange={painel.setAnalyticsRange}
        analyticsPreset={painel.analyticsPreset}
        onAnalyticsPresetChange={painel.setAnalyticsPreset}
        onCreateEvent={() => void navigate({ to: '/admin/jogos' })}
      />
    </PainelPage>
  )
}
