import { createFileRoute, Navigate } from '@tanstack/react-router'
import {
  useMySubscription,
  useShowsGoing
} from '@/components/admin/admin-queries'
import { GoingTab } from '@/components/admin/going-tab'
import { CabecalhoPagina } from '@/components/painel'

export const Route = createFileRoute('/admin/quem-vai')({
  head: () => ({ meta: [{ title: 'Quem vai — Painel do Bar — Onside' }] }),
  component: QuemVaiPage
})

// Por enquanto, a aba de antes dentro do shell novo.
function QuemVaiPage() {
  const showsGoing = useShowsGoing()
  const { data: subscription } = useMySubscription()
  // Sem Elite e sem código em aberto a seção não existe: cai em Hoje.
  if (showsGoing === false) return <Navigate to="/admin" replace />
  return (
    <>
      <CabecalhoPagina titulo="Quem vai" />
      {showsGoing ? (
        <div className="painel-legado">
          <GoingTab active elite={subscription?.currentPlan === 'elite'} />
        </div>
      ) : null}
    </>
  )
}
