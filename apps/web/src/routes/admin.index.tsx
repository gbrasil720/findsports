import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  ADMIN_SECTION_ROUTES,
  getAdminSectionFromHash
} from '@/components/admin/admin-tabs'
import { OverviewTab } from '@/components/admin/overview-tab'
import { InstallAppCard } from '@/components/app/install-app-card'
import { PainelPage, usePainel } from '@/components/painel/painel-shell'

export const Route = createFileRoute('/admin/')({
  component: HojePage
})

function HojePage() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const painel = usePainel()
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
    <PainelPage title="Hoje">
      <OverviewTab
        analyticsRange={painel.analyticsRange}
        onAnalyticsRangeChange={painel.setAnalyticsRange}
        analyticsPreset={painel.analyticsPreset}
        onAnalyticsPresetChange={painel.setAnalyticsPreset}
        onCreateEvent={() => void navigate({ to: '/admin/jogos' })}
      />
      {session ? (
        <div className="mt-6">
          <InstallAppCard userId={session.user.id} surface="admin" />
        </div>
      ) : null}
    </PainelPage>
  )
}
