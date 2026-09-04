/** biome-ignore-all lint/style/noHeadElement: The root shell must render the document head directly. */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: PostHog lifecycle effects intentionally use guarded route state. */
import type { AppRouter } from '@findsports_oficial/api/routers/index'
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
import { NotFoundPage } from '../components/not-found/not-found-page'
import appCss from '../index.css?url'
import { capturePageview, identifyUser, resetAnalytics } from '../lib/analytics'
import { initPostHog } from '../lib/posthog'
import { OG_IMAGE_URL, SITE_URL } from '../lib/site'
import { authMiddleware } from '../middleware/auth'
import { type AuthSession, applyAuthGuards } from '../utils/auth-guards'

export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>
  queryClient: QueryClient
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
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    applyAuthGuards(session as AuthSession, location.pathname, location.search)
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

function DeferredVercelAnalytics() {
  const [Analytics, setAnalytics] = useState<
    typeof import('@vercel/analytics/react').Analytics | null
  >(null)

  useEffect(() => {
    let cancelled = false
    void import('@vercel/analytics/react').then((module) => {
      if (!cancelled) setAnalytics(() => module.Analytics)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return Analytics ? <Analytics /> : null
}

function PostHogProvider() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void initPostHog().then((ok) => {
      if (!cancelled) setReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    if (session?.user) {
      identifyUser({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role
      })
    } else {
      resetAnalytics()
    }
  }, [ready, session?.user?.id])

  useEffect(() => {
    if (!ready) return
    capturePageview(pathname)
  }, [ready, pathname])

  return null
}

function RootDocument() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy
  const isDev = import.meta.env.DEV

  return (
    <>
      <MinuteTickProvider>
        <div
          className="min-h-dvh w-full"
          style={
            {
              '--banner-h': impersonatedBy
                ? 'var(--onside-banner-h, 2.75rem)'
                : '0px',
              paddingTop: 'var(--banner-h)'
            } as CSSProperties
          }
        >
          <PostHogProvider />
          {impersonatedBy ? (
            <Suspense fallback={null}>
              <ImpersonationBanner />
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
      <DeferredVercelAnalytics />
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
