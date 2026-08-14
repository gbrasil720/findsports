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
import { Analytics } from '@vercel/analytics/react'
import posthog from 'posthog-js'
import type { CSSProperties } from 'react'
import { useEffect, useRef } from 'react'
import { ImpersonationBanner } from '../components/impersonation-banner'
import appCss from '../index.css?url'
import { authClient } from '../lib/auth-client'
import { OG_IMAGE_URL, SITE_URL } from '../lib/site'
import { authMiddleware } from '../middleware/auth'
import { type AuthSession, applyAuthGuards } from '../utils/auth-guards'

export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>
  queryClient: QueryClient
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
    applyAuthGuards(session as AuthSession, location.pathname)
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
  shellComponent: RootShell,
  component: RootDocument
})

function PostHogProvider() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const initialized = useRef(false)

  // Init — roda uma vez no cliente
  useEffect(() => {
    if (initialized.current) return
    const projectKey = import.meta.env.VITE_POSTHOG_KEY
    if (!projectKey) return

    posthog.init(projectKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie'
    })
    initialized.current = true
  }, [])

  // Identify — roda quando sessão muda
  useEffect(() => {
    if (!initialized.current) return

    if (session?.user) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
        role: session.user.role
      })
    } else {
      posthog.reset()
    }
  }, [session?.user?.id])

  // Pageview — roda quando rota muda
  useEffect(() => {
    if (!initialized.current) return
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [pathname])

  return null
}

function RootDocument() {
  const { data: session } = authClient.useSession()
  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy
  const isDev = import.meta.env.DEV

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
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
          <ImpersonationBanner />
          <Outlet />
        </div>
        <Toaster richColors />
        {isDev ? (
          <>
            <TanStackRouterDevtools position="bottom-left" />
            <ReactQueryDevtools
              position="bottom"
              buttonPosition="bottom-right"
            />
          </>
        ) : null}
        <Analytics />
        <Scripts />
      </body>
    </html>
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
