import { createFileRoute, Navigate } from '@tanstack/react-router'
import { GoingTab } from '@/components/admin/going-tab'
import { PainelPage, usePainel } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/quem-vai')({
  head: () => ({ meta: [{ title: 'Quem vai — Onside' }] }),
  component: QuemVaiPage
})

function QuemVaiPage() {
  const { showsGoing, elite } = usePainel()
  // Sem Elite e sem código em aberto a seção não existe: volta a Hoje, como o
  // link para a aba antiga fazia.
  if (!showsGoing) return <GoingGate />
  return (
    <PainelPage title="Quem vai">
      <GoingTab elite={elite} />
    </PainelPage>
  )
}

/** Espera o plano e os códigos em aberto antes de mandar embora. */
function GoingGate() {
  const { goingKnown } = usePainel()
  return goingKnown ? <Navigate to="/admin" replace /> : null
}
