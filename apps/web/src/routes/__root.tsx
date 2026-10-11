/** biome-ignore-all lint/style/noHeadElement: The root shell must render the document head directly. */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: PostHog lifecycle effects intentionally use guarded route state. */
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Toaster } from '@findsports_oficial/ui/components/sonner'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query'
import type { CSSProperties } from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { MinuteTickProvider } from '../components/app/minute-tick'
import { CookieConsent } from '../components/consent/cookie-consent'
import { NotFoundPage } from '../components/not-found/not-found-page'
import appCss from '../index.css?url'
import {
  analytics,
  capturePageview,
  ctaFromClickTarget,
  identifyUser,
  resetAnalytics
} from '../lib/analytics'
import { useAnalyticsConsent } from '../lib/analytics-consent'
import { initPostHog, stopPostHog } from '../lib/posthog'
import { OG_IMAGE_URL, SITE_URL } from '../lib/site'
import { authMiddleware } from '../middleware/auth'
import {
  type AuthSession,
  applyAuthGuards,
  isHashOnlyChange,
  type SessionLocation
} from '../utils/auth-guards'

export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>
  queryClient: QueryClient
  syncSession: (userId: string | null) => void
  // Última sessão conferida pelo `beforeLoad` da raiz, por instância de router.
  lastSessionCheck: {
    current?: {
      location: SessionLocation
      session: AuthSession
    }
  }
  session?: AuthSession
}

const getSession = createServerFn()
  .middleware([authMiddleware])
  .handler(({ context }) => {
    return context.session
  })

const ONSIDE_DESCRIPTION =
  'Onside conecta torcedores brasileiros aos bares e pubs que estão transmitindo o jogo que você quer assistir. Encontre o lugar certo para torcer.'

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async ({ location, context }) => {
    const last = context.lastSessionCheck.current
    const session =
      last && isHashOnlyChange(last.location, location)
        ? last.session
        : await getSession()
    context.lastSessionCheck.current = { location, session }
    context.syncSession(session?.user.id ?? null)
    applyAuthGuards(
      session,
      location.pathname,
      location.search,
      location.pathname + location.searchStr
    )
    return { session }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Onside — Ache o bar que está passando seu jogo' },
      {
        name: 'description',
        content: ONSIDE_DESCRIPTION
      },
      { name: 'author', content: 'Onside' },
      { name: 'theme-color', content: '#12120F' },
      { property: 'og:site_name', content: 'Onside' },
      { property: 'og:type', content: 'website' },
      {
        property: 'og:title',
        content: 'Onside — Ache o bar que está passando seu jogo'
      },
      {
        property: 'og:description',
        content:
          'Conecte torcedores brasileiros aos bares que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol.'
      },
      {
        property: 'og:image',
        content: OG_IMAGE_URL
      },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:url', content: `${SITE_URL}/` },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        name: 'twitter:title',
        content: 'Onside — Ache o bar que está passando seu jogo'
      },
      {
        name: 'twitter:description',
        content:
          'Conecte torcedores brasileiros aos bares que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol.'
      },
      {
        name: 'twitter:image',
        content: OG_IMAGE_URL
      }
    ],
    // Cloudflare Web Analytics (Core Web Vitals, sem cookie): a injeção
    // automática não alcança respostas do Worker, então o beacon vai aqui. Só
    // no build — o `vite dev` e o E2E rodam sem rede externa. O token é público.
    scripts: import.meta.env.DEV
      ? []
      : [
          {
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            type: 'module',
            'data-cf-beacon': '{"token": "84a6d0356bc9416cb0e64e8c38c2d5b4"}'
          }
        ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: '/favicon-32x32.png?v=3',
        type: 'image/png',
        sizes: '32x32'
      },
      {
        rel: 'icon',
        href: '/favicon-16x16.png?v=3',
        type: 'image/png',
        sizes: '16x16'
      },
      {
        rel: 'icon',
        href: '/favicon-64x64.png?v=3',
        type: 'image/png',
        sizes: '64x64'
      },
      {
        rel: 'icon',
        href: '/favicon-512x512.png?v=3',
        type: 'image/png',
        sizes: '512x512'
      },
      {
        rel: 'icon',
        href: '/favicon.ico?v=3',
        type: 'image/x-icon',
        sizes: 'any'
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png?v=3',
        sizes: '180x180'
      }
    ]
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootShell,
  component: RootDocument
})

const ImpersonationBanner = lazy(() =>
  import('../components/impersonation-banner').then((module) => ({
    default: module.ImpersonationBanner
  }))
)

function PostHogProvider() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const consent = useAnalyticsConsent()
  const [ready, setReady] = useState(false)

  // WEB-243: a análise liga com o aceite e desliga com a recusa, na mesma
  // visita. Sem escolha é como recusa — e apaga o cookie de quem foi medido
  // antes de este aviso existir.
  useEffect(() => {
    if (consent === 'ssr') return
    if (consent !== 'granted') {
      stopPostHog()
      setReady(false)
      return
    }
    let cancelled = false
    void initPostHog().then((ok) => {
      if (!cancelled) setReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [consent])

  useEffect(() => {
    if (!ready) return

    if (session?.user) {
      identifyUser({ id: session.user.id, role: session.user.role })
    } else {
      resetAnalytics()
    }
  }, [ready, session?.user?.id])

  useEffect(() => {
    if (!ready) return
    capturePageview(pathname)
  }, [ready, pathname])

  // Um listener só, delegado no documento: clique em qualquer `data-cta`
  // (landing e páginas legais) vira `cta_clicked`. O consentimento é
  // conferido em `withPosthog`, como em todo evento.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const cta = ctaFromClickTarget(event.target)
      if (cta) analytics.ctaClicked(cta)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}

function RootDocument() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const impersonated = session?.session.impersonatedBy ? session.user : null
  const isDev = import.meta.env.DEV

  // Marca de hidratação para o E2E (WEB-174): antes dela, o formulário ainda
  // é HTML puro e um clique faz submit nativo. `fixtures/test.ts` espera por ela.
  useEffect(() => {
    document.documentElement.dataset.hydrated = ''
  }, [])

  return (
    <>
      <MinuteTickProvider>
        {/*
         * `--banner-h` continua existindo porque os cabeçalhos grudados das
         * telas internas se deslocam por ele. O `paddingTop` saiu: o banner
         * agora é `sticky` e já ocupa a própria altura no fluxo — somar o
         * padding abriria uma faixa vazia do tamanho do banner.
         */}
        <div
          className="min-h-dvh w-full"
          style={
            {
              '--banner-h': impersonated
                ? 'var(--onside-banner-h, 2.75rem)'
                : '0px'
            } as CSSProperties
          }
        >
          <PostHogProvider />
          <CookieConsent />
          {impersonated ? (
            <Suspense
              fallback={
                <div
                  className="onside-banner sticky top-0 right-0 left-0 z-[60] border-[var(--onside-ink)] border-b bg-[var(--onside-acid)]"
                  role="status"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <span className="sr-only">
                    Carregando aviso de personificação…
                  </span>
                  <div className="mx-auto flex min-h-11 w-full max-w-[var(--onside-max)] items-center gap-2.5 px-4 py-2.5">
                    <Skeleton className="size-7 bg-[var(--onside-ink)]/20" />
                    <Skeleton className="h-4 w-64 max-w-[calc(100vw-5rem)] bg-[var(--onside-ink)]/20" />
                  </div>
                </div>
              }
            >
              <ImpersonationBanner user={impersonated} />
            </Suspense>
          ) : null}
          <Outlet />
        </div>
      </MinuteTickProvider>
      <Toaster richColors />
      {isDev ? (
        <>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </>
      ) : null}
    </>
  )
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
