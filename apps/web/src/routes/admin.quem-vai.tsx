import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useShowsGoing } from '@/components/admin/admin-queries'
import { QuemVaiPage } from '@/components/painel-jogos/quem-vai-page'

export const Route = createFileRoute('/admin/quem-vai')({
  head: () => ({
    meta: [{ title: 'Quem vai — Painel do Bar — Onside' }]
  }),
  component: QuemVaiRoute
})

function QuemVaiRoute() {
  const showsGoing = useShowsGoing()
  // Sem Elite e sem código em aberto a seção não existe: cai em Hoje.
  if (showsGoing === false) return <Navigate to="/admin" replace />
  return showsGoing ? <QuemVaiPage /> : null
}
