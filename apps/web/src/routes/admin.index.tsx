import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  ADMIN_SECTION_ROUTES,
  getAdminSectionFromHash
} from '@/components/admin/admin-tabs'
import { InstallAppCard } from '@/components/app/install-app-card'
import { HojePage as Hoje } from '@/components/painel/hoje'

export const Route = createFileRoute('/admin/')({
  // `?passeio=1`: a primeira entrada depois do plano do teste abre o passeio
  // pelo painel (`components/painel/passeio.tsx`).
  validateSearch: (search: Record<string, unknown>): { passeio?: 1 } =>
    search.passeio === 1 || search.passeio === '1' ? { passeio: 1 } : {},
  component: HojePage
})

function HojePage() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const navigate = useNavigate()

  // `/admin#admin-espaco` (aba antiga, link de e-mail ou favorito): o hash não
  // chega ao servidor, então a troca para a rota nova é aqui.
  useEffect(() => {
    const follow = () => {
      const section = getAdminSectionFromHash(window.location.hash)
      if (section && section !== 'admin-visao') {
        void navigate({ to: ADMIN_SECTION_ROUTES[section], replace: true })
      }
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [navigate])

  return (
    <>
      <Hoje />
      {session ? (
        <div className="pn-install">
          <InstallAppCard userId={session.user.id} surface="admin" />
        </div>
      ) : null}
    </>
  )
}
