import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SpaceTab } from '@/components/admin/space-tab'
import { PainelPage } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/meu-espaco')({
  head: () => ({ meta: [{ title: 'Meu espaço — Onside' }] }),
  component: MeuEspacoPage
})

function MeuEspacoPage() {
  const navigate = useNavigate()
  return (
    <PainelPage title="Meu espaço">
      <SpaceTab onCreateEvent={() => void navigate({ to: '/admin/jogos' })} />
    </PainelPage>
  )
}
