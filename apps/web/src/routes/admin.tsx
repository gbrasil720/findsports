import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMyBar } from '@/components/admin/admin-queries'
import { getAdminRouteFromHash } from '@/components/admin/admin-tabs'
import { InstallAppCard } from '@/components/app/install-app-card'
import { ErroBloco, PainelShell } from '@/components/painel'
import painelCss from '@/components/painel/painel.css?url'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'

/**
 * Painel do bar: o shell (barra lateral) e, dentro dele, a rota filha —
 * `/admin` (Hoje), `/admin/jogos`, `/admin/quem-vai`, `/admin/meu-espaco`,
 * `/admin/configuracoes`, `/admin/billing` e `/admin/validate`. Quem entra
 * (só bar com onboarding feito) é decidido em `utils/auth-guards.ts`.
 */
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Painel do Bar — Onside' },
      {
        name: 'description',
        content:
          'Gerencie a programação de jogos do seu bar e atraia torcedores perto de você.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [{ rel: 'stylesheet', href: painelCss }, ...PWA_LINKS]
  }),
  component: AdminLayout
})

/**
 * As abas de antes eram hash (`/admin#admin-grade`). O hash não chega ao
 * servidor, então a troca pela rota nova é no cliente, sem entrada nova no
 * histórico.
 */
function useLegacyTabRedirect() {
  const { pathname, hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (pathname !== '/admin' && pathname !== '/admin/') return
    const to = getAdminRouteFromHash(hash)
    if (to && to !== '/admin') void navigate({ to, replace: true })
  }, [pathname, hash, navigate])
}

function AdminLayout() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  useLegacyTabRedirect()
  const {
    isLoading,
    isError,
    isFetching,
    error,
    data: bar,
    refetch
  } = useMyBar()

  return (
    <PainelShell>
      {isLoading ? (
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Carregando painel do bar…</span>
          <Skeleton className="h-14 w-72 max-w-full bg-[var(--painel-sub)]" />
          <Skeleton className="h-32 w-full bg-[var(--painel-sub)]" />
          <Skeleton className="h-64 w-full bg-[var(--painel-sub)]" />
        </div>
      ) : isError || !bar ? (
        <ErroBloco
          titulo="Não foi possível carregar os dados do bar."
          erro={error}
          tentar={refetch}
          tentando={isFetching}
        />
      ) : (
        <>
          <Outlet />
          {session ? (
            <InstallAppCard userId={session.user.id} surface="admin" />
          ) : null}
        </>
      )}
    </PainelShell>
  )
}
