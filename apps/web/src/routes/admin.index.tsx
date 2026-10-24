import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { getAnalyticsRange } from '@/components/admin/analytics-period'
import { OverviewTab } from '@/components/admin/overview-tab'
import { CabecalhoPagina } from '@/components/painel'

export const Route = createFileRoute('/admin/')({
  component: HojePage
})

// Por enquanto, a Visão geral de antes dentro do shell novo.
function HojePage() {
  const navigate = useNavigate()
  const [analyticsRange, setAnalyticsRange] = useState(() =>
    getAnalyticsRange('30d')
  )
  return (
    <>
      <CabecalhoPagina titulo="Hoje na casa" tamanho={60} />
      <div className="painel-legado">
        <OverviewTab
          active
          analyticsRange={analyticsRange}
          onAnalyticsRangeChange={setAnalyticsRange}
          onCreateEvent={() => void navigate({ to: '/admin/jogos' })}
        />
      </div>
    </>
  )
}
