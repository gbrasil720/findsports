import { createFileRoute, Navigate } from '@tanstack/react-router'
import { usePainel } from '@/components/painel/painel-shell'
import { QuemVaiPage } from '@/components/painel/quem-vai'

export const Route = createFileRoute('/admin/quem-vai')({
  head: () => ({ meta: [{ title: 'Quem vai — Onside' }] }),
  component: QuemVai
})

function QuemVai() {
  const { showsGoing, goingKnown } = usePainel()
  // Sem Elite e sem código em aberto a seção não existe: volta a Hoje, depois
  // de o plano e os códigos em aberto responderem.
  if (showsGoing) return <QuemVaiPage />
  return goingKnown ? <Navigate to="/admin" replace /> : null
}
