import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SpaceTab } from '@/components/admin/space-tab'
import { CabecalhoPagina } from '@/components/painel'

export const Route = createFileRoute('/admin/meu-espaco')({
  head: () => ({ meta: [{ title: 'Meu espaço — Painel do Bar — Onside' }] }),
  component: MeuEspacoPage
})

// Por enquanto, a aba de antes dentro do shell novo.
function MeuEspacoPage() {
  const navigate = useNavigate()
  return (
    <>
      <CabecalhoPagina titulo="Meu espaço" />
      <div className="painel-legado">
        <SpaceTab
          active
          onCreateEvent={() => void navigate({ to: '/admin/jogos' })}
        />
      </div>
    </>
  )
}
