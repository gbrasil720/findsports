/** biome-ignore-all lint/style/noHeadElement: The root shell must render the document head directly. */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: PostHog lifecycle effects intentionally use guarded route state. */
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { Toaster } from '@findsports_oficial/ui/components/sonner'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  HeadContent,
  isNotFound,
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
import { NOT_FOUND_META } from '../components/not-found/not-found-head'
import { NotFoundPage } from '../components/not-found/not-found-page'
import appCss from '../index.css?url'
import {
  analytics,
  capturePageview,
  ctaFromClickTarget,
  identifyUser,
  resetAnalytics
} from '../lib/analytics'
import {
  CONSENT_HEAD_SCRIPT,
  consentBannerEnabled,
  useAnalyticsConsent
} from '../lib/analytics-consent'
import { initPostHog, stopPostHog } from '../lib/posthog'
import { OG_IMAGE_URL } from '../lib/site'
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

// O Google só usa favicon quadrado com lado múltiplo de 48 px (48, 96, 192);
// 16 e 32 ficam para a aba do navegador. Arte em `public/onside-app-icon.png`.
const ONSIDE_ICONS = [
  {
    rel: 'icon',
    href: '/favicon.ico?v=4',
    type: 'image/x-icon',
    sizes: '16x16 32x32 48x48 64x64'
  },
  ...[48, 96, 192, 32, 16].map((lado) => ({
    rel: 'icon',
    href: `/favicon-${lado}x${lado}.png?v=4`,
    type: 'image/png',
    sizes: `${lado}x${lado}`
  })),
  {
    rel: 'apple-touch-icon',
    href: '/apple-touch-icon.png?v=3',
    sizes: '180x180'
  }
]

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
  head: ({ matches }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...(matches.some((m) => m.status === 'notFound' || isNotFound(m.error))
        ? NOT_FOUND_META
        : [
            { title: 'Onside — Ache o bar que está passando seu jogo' },
            { name: 'description', content: ONSIDE_DESCRIPTION }
          ]),
      { name: 'author', content: 'Onside' },
      { name: 'theme-color', content: '#12120F' },
      { property: 'og:site_name', content: 'Onside' },
      { property: 'og:locale', content: 'pt_BR' },
      { property: 'og:type', content: 'website' },
      // Título, descrição e `og:url` do cartão são de cada página
      // (`lib/page-head.ts`): aqui eles vazariam os da home para as demais.
      {
        property: 'og:image',
        content: OG_IMAGE_URL
      },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
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
            // Medição, não conteúdo: baixa depois do que a primeira tela usa.
            fetchPriority: 'low',
            'data-cf-beacon': '{"token": "84a6d0356bc9416cb0e64e8c38c2d5b4"}'
          }
        ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // O Houdini declara os ícones dele (a cartola); dois conjuntos na mesma
      // página deixam a escolha com o navegador.
      ...(matches.some((m) => (m.routeId as string) === '/houdini')
        ? []
        : ONSIDE_ICONS)
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
  const impersonated = session?.session.impersonatedBy ? session : null
  const isDev = import.meta.env.DEV
  // WEB-383: o Houdini não mede o admin nem pede consentimento de cookie.
  const inHoudini = useRouterState({
    select: (s) =>
      s.location.pathname === '/houdini' ||
      s.location.pathname.startsWith('/houdini/')
  })

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
                ? 'var(--onside-banner-h, 3.5rem)'
                : '0px'
            } as CSSProperties
          }
        >
          {inHoudini ? null : (
            <>
              <PostHogProvider />
              <CookieConsent />
            </>
          )}
          {impersonated && !inHoudini ? (
            <Suspense
              fallback={
                <div
                  className="onside-pele"
                  style={{ minHeight: 56 }}
                  role="status"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <span className="sr-only">Carregando a faixa da pele…</span>
                </div>
              }
            >
              <ImpersonationBanner
                user={impersonated.user}
                mode={impersonated.session.impersonationMode ?? 'look'}
                startedAt={impersonated.session.createdAt}
              />
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
    // `suppressHydrationWarning`: o script abaixo põe `data-consent` no
    // `<html>` antes da hidratação, e o React não conhece esse atributo.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {consentBannerEnabled() ? (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: texto fixo do próprio app, sem dado de fora
            dangerouslySetInnerHTML={{ __html: CONSENT_HEAD_SCRIPT }}
          />
        ) : null}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
