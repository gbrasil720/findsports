import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { getAnalyticsRange } from '@/components/admin/analytics-period'
import { ScheduleTab } from '@/components/admin/schedule-tab'
import { CabecalhoPagina } from '@/components/painel'

export const Route = createFileRoute('/admin/jogos')({
  head: () => ({ meta: [{ title: 'Jogos — Painel do Bar — Onside' }] }),
  // `?novo=1`: abre o formulário de jogo novo ("Novo jogo" do Hoje).
  validateSearch: (search: Record<string, unknown>): { novo?: 1 } =>
    search.novo === 1 || search.novo === '1' ? { novo: 1 } : {},
  component: JogosPage
})

// Por enquanto, a grade de antes dentro do shell novo.
function JogosPage() {
  const [analyticsRange] = useState(() => getAnalyticsRange('30d'))
  return (
    <>
      <CabecalhoPagina titulo="Jogos" />
      <div className="painel-legado">
        <ScheduleTab active analyticsRange={analyticsRange} />
      </div>
    </>
  )
}
